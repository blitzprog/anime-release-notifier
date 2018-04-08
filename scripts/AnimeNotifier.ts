import Application from "./Application"
import Diff from "./Diff"
import StatusMessage from "./StatusMessage"
import PushManager from "./PushManager"
import TouchController from "./TouchController"
import NotificationManager from "./NotificationManager"
import AudioPlayer from "./AudioPlayer"
import Analytics from "./Analytics"
import SideBar from "./SideBar"
import InfiniteScroller from "./InfiniteScroller"
import ServiceWorkerManager from "./ServiceWorkerManager"
import { displayAiringDate, displayDate, displayTime } from "./DateView"
import { findAll, canUseWebP, requestIdleCallback, swapElements, delay } from "./Utils"
import { checkNewVersionDelayed } from "./NewVersionCheck"
import * as actions from "./Actions"

export default class AnimeNotifier {
	app: Application
	analytics: Analytics
	user: HTMLElement
	title: string
	webpEnabled: boolean
	contentLoadedActions: Promise<any>
	statusMessage: StatusMessage
	visibilityObserver: IntersectionObserver
	pushManager: PushManager
	serviceWorkerManager: ServiceWorkerManager
	notificationManager: NotificationManager
	touchController: TouchController
	audioPlayer: AudioPlayer
	sideBar: SideBar
	infiniteScroller: InfiniteScroller
	mainPageLoaded: boolean
	isLoading: boolean
	diffCompletedForCurrentPath: boolean
	lastReloadContentPath: string
	currentSoundTrackId: string

	constructor(app: Application) {
		this.app = app
		this.user = null
		this.title = "Anime Notifier"
		this.isLoading = true

		// These classes will never be removed on DOM diffs
		Diff.persistentClasses.add("mounted")
		Diff.persistentClasses.add("element-found")
		Diff.persistentClasses.add("active")

		// Never remove src property on diffs
		Diff.persistentAttributes.add("src")

		// Is intersection observer supported?
		if("IntersectionObserver" in window) {
			// Enable lazy load
			this.visibilityObserver = new IntersectionObserver(
				entries => {
					for(let entry of entries) {
						if(entry.isIntersecting) {
							entry.target["became visible"]()
							this.visibilityObserver.unobserve(entry.target)
						}
					}
				},
				{}
			)
		} else {
			// Disable lazy load feature
			this.visibilityObserver = {
				disconnect: () => {},
				observe: (elem: HTMLElement) => {
					elem["became visible"]()
				},
				unobserve: (elem: HTMLElement) => {}
			} as IntersectionObserver
		}
	}

	init() {
		// App init
		this.app.init()

		// Event listeners
		document.addEventListener("readystatechange", this.onReadyStateChange.bind(this))
		document.addEventListener("DOMContentLoaded", this.onContentLoaded.bind(this))
		document.addEventListener("keydown", this.onKeyDown.bind(this), false)
		window.addEventListener("popstate", this.onPopState.bind(this))

		// Idle
		requestIdleCallback(this.onIdle.bind(this))
	}

	onReadyStateChange() {
		if(document.readyState !== "interactive") {
			return
		}

		this.run()
	}

	run() {
		// Check for WebP support
		this.webpEnabled = canUseWebP()

		// Initiate the elements we need
		this.user = document.getElementById("user")
		this.app.content = document.getElementById("content")
		this.app.loading = document.getElementById("loading")

		// Theme
		if(this.user && this.user.dataset.pro === "true" && this.user.dataset.theme !== "light") {
			actions.darkTheme(this)
		}

		// Status message
		this.statusMessage = new StatusMessage(
			document.getElementById("status-message"),
			document.getElementById("status-message-text")
		)

		this.app.onError = (error: Error) => {
			this.statusMessage.showError(error, 3000)
		}

		// Push manager
		this.pushManager = new PushManager()

		// Notification manager
		this.notificationManager = new NotificationManager()

		// Audio player
		this.audioPlayer = new AudioPlayer(this)

		// Analytics
		this.analytics = new Analytics()

		// Sidebar control
		this.sideBar = new SideBar(document.getElementById("sidebar"))

		// Infinite scrolling
		this.infiniteScroller = new InfiniteScroller(this.app.content.parentElement, 150)

		// Loading
		this.loading(false)
	}

	onContentLoaded() {
		// Stop watching all the objects from the previous page.
		this.visibilityObserver.disconnect()

		this.contentLoadedActions = Promise.all([
			Promise.resolve().then(() => this.mountMountables()),
			Promise.resolve().then(() => this.lazyLoad()),
			Promise.resolve().then(() => this.displayLocalDates()),
			Promise.resolve().then(() => this.setSelectBoxValue()),
			Promise.resolve().then(() => this.markPlayingSoundTrack()),
			Promise.resolve().then(() => this.assignActions()),
			Promise.resolve().then(() => this.updatePushUI()),
			Promise.resolve().then(() => this.dragAndDrop()),
			Promise.resolve().then(() => this.colorStripes()),
			Promise.resolve().then(() => this.countUp())
		])

		// Apply page title
		let headers = document.getElementsByTagName("h1")

		if(this.app.currentPath === "/" || headers.length === 0 || headers[0].innerText === "NOTIFY.MOE") {
			if(document.title !== this.title) {
				document.title = this.title
			}
		} else {
			document.title = headers[0].innerText
		}
	}

	async onIdle() {
		// Service worker
		this.serviceWorkerManager = new ServiceWorkerManager(this, "/service-worker")
		this.serviceWorkerManager.register()

		// Analytics
		if(this.user) {
			this.analytics.push()
		}

		// Offline message
		if(navigator.onLine === false) {
			this.statusMessage.showError("You are viewing an offline version of the site now.")
		}

		// Notification manager
		if(this.user) {
			this.notificationManager.update()
		}

		// Bind unload event
		window.addEventListener("beforeunload", this.onBeforeUnload.bind(this))

		// Periodically check etags of scripts and styles to let the user know about page updates
		checkNewVersionDelayed("/scripts", this.statusMessage)
		checkNewVersionDelayed("/styles", this.statusMessage)

		// // Download popular anime titles for the search
		// let response = await fetch("/api/popular/anime/titles/500")
		// let titles = await response.json()
		// let titleList = document.createElement("datalist")
		// titleList.id = "popular-anime-titles-list"

		// for(let title of titles) {
		// 	let option = document.createElement("option")
		// 	option.value = title
		// 	titleList.appendChild(option)
		// }

		// document.body.appendChild(titleList)

		// let search = document.getElementById("search") as HTMLInputElement
		// search.setAttribute("list", titleList.id)
	}

	async onBeforeUnload(e: BeforeUnloadEvent) {
		let message = undefined

		// Prevent closing tab on new thread page
		if(this.app.currentPath === "/new/thread" && document.activeElement.tagName === "TEXTAREA" && (document.activeElement as HTMLTextAreaElement).value.length > 20) {
			message = "You have unsaved changes on the current page. Are you sure you want to leave?"
		}

		if(message) {
			e.returnValue = message
			return message
		}
	}

	dragAndDrop() {
		for(let element of findAll("inventory-slot")) {
			// Skip elements that have their event listeners attached already
			if(element["listeners-attached"]) {
				continue
			}

			element.addEventListener("dragstart", e => {
				if(!element.draggable) {
					return
				}

				e.dataTransfer.setData("text", element.dataset.index)
			}, false)

			element.addEventListener("dblclick", e => {
				if(!element.draggable) {
					return
				}

				let itemName = element.title

				if(element.dataset.consumable !== "true") {
					return this.statusMessage.showError(itemName + " is not a consumable item.")
				}

				let apiEndpoint = this.findAPIEndpoint(element)

				this.post(apiEndpoint + "/use/" + element.dataset.index, "")
				.then(() => this.reloadContent())
				.then(() => this.statusMessage.showInfo(`You used ${itemName}.`))
				.catch(err => this.statusMessage.showError(err))
			}, false)

			element.addEventListener("dragenter", e => {
				element.classList.add("drag-enter")
			}, false)

			element.addEventListener("dragleave", e => {
				element.classList.remove("drag-enter")
			}, false)

			element.addEventListener("dragover", e => {
				e.preventDefault()
			}, false)

			element.addEventListener("drop", e => {
				let toElement = e.toElement as HTMLElement
				toElement.classList.remove("drag-enter")

				e.stopPropagation()
				e.preventDefault()

				let inventory = e.toElement.parentElement
				let fromIndex = e.dataTransfer.getData("text")

				if(!fromIndex) {
					return
				}

				let fromElement = inventory.childNodes[fromIndex] as HTMLElement

				let toIndex = toElement.dataset.index

				if(fromElement === toElement || fromIndex === toIndex) {
					return
				}

				// Swap in database
				let apiEndpoint = this.findAPIEndpoint(inventory)

				this.post(apiEndpoint + "/swap/" + fromIndex + "/" + toIndex, "")
				.catch(err => this.statusMessage.showError(err))

				// Swap in UI
				swapElements(fromElement, toElement)

				fromElement.dataset.index = toIndex
				toElement.dataset.index = fromIndex
			}, false)

			// Prevent re-attaching the same listeners
			element["listeners-attached"] = true
		}
	}

	async updatePushUI() {
		if(!this.app.currentPath.includes("/settings/notifications")) {
			return
		}

		let enableButton = document.getElementById("enable-notifications") as HTMLButtonElement
		let disableButton = document.getElementById("disable-notifications") as HTMLButtonElement
		let testButton = document.getElementById("test-notification") as HTMLButtonElement

		if(!this.pushManager.pushSupported) {
			enableButton.classList.add("hidden")
			disableButton.classList.add("hidden")
			testButton.innerHTML = "Your browser doesn't support push notifications!"
			return
		}

		let subscription = await this.pushManager.subscription()

		if(subscription) {
			enableButton.classList.add("hidden")
			disableButton.classList.remove("hidden")
		} else {
			enableButton.classList.remove("hidden")
			disableButton.classList.add("hidden")
		}
	}

	colorStripes() {
		if(!this.app.currentPath.includes("/explore/color/")) {
			return
		}

		for(let element of findAll("color-stripe")) {
			Diff.mutations.queue(() => {
				element.style.backgroundColor = element.dataset.color
			})
		}
	}

	countUp() {
		if(!this.app.currentPath.includes("/paypal/success")) {
			return
		}

		for(let element of findAll("count-up")) {
			let final = parseInt(element.innerText)
			let duration = 2000.0
			let start = Date.now()

			element.innerText = "0"

			let callback = () => {
				let progress = (Date.now() - start) / duration

				if(progress > 1) {
					progress = 1
				}

				element.innerText = String(Math.round(progress * final))

				if(progress < 1) {
					window.requestAnimationFrame(callback)
				}
			}

			window.requestAnimationFrame(callback)
		}
	}

	markPlayingSoundTrack() {
		for(let element of findAll("soundtrack-play-area")) {
			if(element.dataset.soundtrackId === this.currentSoundTrackId) {
				element.classList.add("playing")
			}
		}
	}

	setSelectBoxValue() {
		for(let element of document.getElementsByTagName("select")) {
			element.value = element.getAttribute("value")
		}
	}

	displayLocalDates() {
		const now = new Date()

		for(let element of findAll("utc-airing-date")) {
			displayAiringDate(element, now)
		}

		for(let element of findAll("utc-date")) {
			displayDate(element, now)
		}

		for(let element of findAll("utc-date-absolute")) {
			displayTime(element, now)
		}
	}

	reloadContent(cached?: boolean) {
		let headers = new Headers()

		if(!cached) {
			headers.append("X-Reload", "true")
		} else {
			headers.append("X-CacheOnly", "true")
		}

		let path = this.app.currentPath
		this.lastReloadContentPath = path

		return fetch("/_" + path, {
			credentials: "same-origin",
			headers
		})
		.then(response => {
			if(this.app.currentPath !== path) {
				return Promise.reject("old request")
			}

			return Promise.resolve(response)
		})
		.then(response => response.text())
		.then(html => Diff.innerHTML(this.app.content, html))
		.then(() => this.app.emit("DOMContentLoaded"))
	}

	reloadPage() {
		console.log("reload page", this.app.currentPath)

		let path = this.app.currentPath
		this.lastReloadContentPath = path

		return fetch(path, {
			credentials: "same-origin"
		})
		.then(response => {
			if(this.app.currentPath !== path) {
				return Promise.reject("old request")
			}

			return Promise.resolve(response)
		})
		.then(response => response.text())
		.then(html => Diff.root(document.documentElement, html))
		.then(() => this.app.emit("DOMContentLoaded"))
		.then(() => this.loading(false)) // Because our loading element gets reset due to full page diff
	}

	loading(newState: boolean) {
		this.isLoading = newState

		if(this.isLoading) {
			document.documentElement.style.cursor = "progress"
			this.app.loading.classList.remove(this.app.fadeOutClass)
		} else {
			document.documentElement.style.cursor = "auto"
			this.app.loading.classList.add(this.app.fadeOutClass)
		}
	}

	assignActions() {
		for(let element of findAll("action")) {
			let actionTrigger = element.dataset.trigger
			let actionName = element.dataset.action

			// Filter out invalid definitions
			if(!actionTrigger || !actionName) {
				continue
			}

			let oldAction = element["action assigned"]

			if(oldAction) {
				if(oldAction.trigger === actionTrigger && oldAction.action === actionName) {
					continue
				}

				element.removeEventListener(oldAction.trigger, oldAction.handler)
			}

			// This prevents default actions on links
			if(actionTrigger === "click" && element.tagName === "A") {
				element.onclick = null
			}

			// Warn us about undefined actions
			if(!(actionName in actions)) {
				this.statusMessage.showError(`Action '${actionName}' has not been defined`)
				continue
			}

			// Register the actual action handler
			let actionHandler = e => {
				actions[actionName](this, element, e)

				e.stopPropagation()
				e.preventDefault()
			}

			element.addEventListener(actionTrigger, actionHandler)

			// Use "action assigned" flag instead of removing the class.
			// This will make sure that DOM diffs which restore the class name
			// will not assign the action multiple times to the same element.
			element["action assigned"] = {
				trigger: actionTrigger,
				action: actionName,
				handler: actionHandler
			}
		}
	}

	lazyLoad(elements?: IterableIterator<Element>) {
		if(!elements) {
			elements = findAll("lazy")
		}

		for(let element of elements) {
			switch(element.tagName) {
				case "IMG":
					this.lazyLoadImage(element as HTMLImageElement)
					break

				case "IFRAME":
					this.lazyLoadIFrame(element as HTMLIFrameElement)
					break
			}
		}
	}

	emptyPixel() {
		return "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
	}

	lazyLoadImage(element: HTMLImageElement) {
		// Once the image becomes visible, load it
		element["became visible"] = () => {
			let dataSrc = element.dataset.src
			let dotPos = dataSrc.lastIndexOf(".")
			let base = dataSrc.substring(0, dotPos)
			let extension = ""

			// Replace URL with WebP if supported
			if(this.webpEnabled && element.dataset.webp === "true") {
				let queryPos = dataSrc.lastIndexOf("?")

				if(queryPos !== -1) {
					extension = ".webp" + dataSrc.substring(queryPos)
				} else {
					extension = ".webp"
				}
			} else {
				extension = dataSrc.substring(dotPos)
			}

			// Anime images on Retina displays
			if(base.includes("/anime/") && window.devicePixelRatio > 1) {
				base += "@2"
			}

			let finalSrc = base + extension

			if(element.src !== finalSrc && element.src !== "https:" + finalSrc && element.src !== "https://notify.moe" + finalSrc) {
				// Show average color
				if(element.dataset.color) {
					element.src = this.emptyPixel()
					element.style.backgroundColor = element.dataset.color
					Diff.mutations.queue(() => element.classList.add("element-color-preview"))
				}

				Diff.mutations.queue(() => element.classList.remove("element-found"))
				element.src = finalSrc
			}

			if(element.naturalWidth === 0) {
				element.onload = () => {
					if(element.src.startsWith("data:")) {
						return
					}

					Diff.mutations.queue(() => element.classList.add("element-found"))
				}

				element.onerror = () => {
					if(element.classList.contains("element-found")) {
						return
					}

					Diff.mutations.queue(() => element.classList.add("element-not-found"))
				}
			} else {
				Diff.mutations.queue(() => element.classList.add("element-found"))
			}
		}

		this.visibilityObserver.observe(element)
	}

	lazyLoadIFrame(element: HTMLIFrameElement) {
		// Once the iframe becomes visible, load it
		element["became visible"] = () => {
			// If the source is already set correctly, don't set it again to avoid iframe flickering.
			if(element.src !== element.dataset.src && element.src !== (window.location.protocol + element.dataset.src)) {
				element.src = element.dataset.src
			}

			Diff.mutations.queue(() => element.classList.add("element-found"))
		}

		this.visibilityObserver.observe(element)
	}

	mountMountables(elements?: IterableIterator<HTMLElement>) {
		if(!elements) {
			elements = findAll("mountable")
		}

		this.modifyDelayed(elements, element => element.classList.add("mounted"))
	}

	unmountMountables() {
		for(let element of findAll("mountable")) {
			if(element.classList.contains("never-unmount")) {
				continue
			}

			Diff.mutations.queue(() => element.classList.remove("mounted"))
		}
	}

	modifyDelayed(elements: IterableIterator<HTMLElement>, func: (element: HTMLElement) => void) {
		const maxDelay = 1000
		const delay = 18

		let time = 0
		let start = Date.now()
		let maxTime = start + maxDelay

		let mountableTypes = new Map<string, number>()
		let mountableTypeMutations = new Map<string, Array<any>>()

		for(let element of elements) {
			// Skip already mounted elements.
			// This helps a lot when dealing with infinite scrolling
			// where the first elements are already mounted.
			if(element.classList.contains("mounted")) {
				continue
			}

			let type = element.dataset.mountableType || "general"

			if(mountableTypes.has(type)) {
				time = mountableTypes.get(type) + delay
				mountableTypes.set(type, time)
			} else {
				time = start
				mountableTypes.set(type, time)
				mountableTypeMutations.set(type, [])
			}

			if(time > maxTime) {
				time = maxTime
			}

			mountableTypeMutations.get(type).push({
				element,
				time
			})
		}

		for(let mountableType of mountableTypeMutations.keys()) {
			let mutations = mountableTypeMutations.get(mountableType)
			let mutationIndex = 0

			let updateBatch = () => {
				let now = Date.now()

				for(; mutationIndex < mutations.length; mutationIndex++) {
					let mutation = mutations[mutationIndex]

					if(mutation.time > now) {
						break
					}

					func(mutation.element)
				}

				if(mutationIndex < mutations.length) {
					window.requestAnimationFrame(updateBatch)
				}
			}

			window.requestAnimationFrame(updateBatch)
		}
	}

	async diff(url: string) {
		if(url === this.app.currentPath) {
			return null
		}

		let path = "/_" + url

		try {
			// Start the request
			let request = fetch(path, {
				credentials: "same-origin"
			})
			.then(response => response.text())

			history.pushState(url, null, url)
			this.app.currentPath = url
			this.diffCompletedForCurrentPath = false
			this.app.markActiveLinks()
			this.unmountMountables()
			this.loading(true)

			// Delay by transition-speed
			await delay(150)

			let html = await request

			// If the response for the correct path has not arrived yet, show this response
			if(!this.diffCompletedForCurrentPath) {
				// If this response was the most recently requested one, mark the requests as completed
				if(this.app.currentPath === url) {
					this.diffCompletedForCurrentPath = true
				}

				// Update contents
				await Diff.innerHTML(this.app.content, html)
				this.app.emit("DOMContentLoaded")
			}
		} catch(err) {
			console.error(err)
		} finally {
			this.loading(false)
		}
	}

	innerHTML(element: HTMLElement, html: string) {
		return Diff.innerHTML(element, html)
	}

	post(url: string, body: any) {
		if(this.isLoading) {
			return Promise.resolve(null)
		}

		if(typeof body !== "string") {
			body = JSON.stringify(body)
		}

		this.loading(true)

		return fetch(url, {
			method: "POST",
			body,
			credentials: "same-origin"
		})
		.then(response => {
			this.loading(false)

			if(response.status === 200) {
				return Promise.resolve(response)
			}

			return response.text().then(err => {
				throw err
			})
		})
		.catch(err => {
			this.loading(false)
			throw err
		})
	}

	scrollTo(target: HTMLElement) {
		const duration = 250.0
		const steps = 60
		const interval = duration / steps
		const fullSin = Math.PI / 2
		const contentPadding = 24

		let scrollHandle: number
		let newScroll = 0
		let finalScroll = Math.max(target.offsetTop - contentPadding, 0)

		// Calculating scrollTop will force a layout - careful!
		let oldScroll = this.app.content.parentElement.scrollTop
		let scrollDistance = finalScroll - oldScroll

		if(scrollDistance > 0 && scrollDistance < 4) {
			return
		}

		let timeStart = Date.now()
		let timeEnd = timeStart + duration

		let scroll = () => {
			let time = Date.now()
			let progress = (time - timeStart) / duration

			if(progress > 1.0) {
				progress = 1.0
			}

			newScroll = oldScroll + scrollDistance * Math.sin(progress * fullSin)
			this.app.content.parentElement.scrollTop = newScroll

			if(time < timeEnd && newScroll != finalScroll) {
				window.requestAnimationFrame(scroll)
			}
		}

		window.requestAnimationFrame(scroll)
	}

	findAPIEndpoint(element: HTMLElement) {
		if(element.dataset.api !== undefined) {
			return element.dataset.api
		}

		let apiObject: HTMLElement
		let parent = element

		while(parent = parent.parentElement) {
			if(parent.dataset.api !== undefined) {
				apiObject = parent
				break
			}
		}

		if(!apiObject) {
			throw "API object not found"
		}

		return apiObject.dataset.api
	}

	onPopState(e: PopStateEvent) {
		if(e.state) {
			this.app.load(e.state, {
				addToHistory: false
			})
		} else if(this.app.currentPath !== this.app.originalPath) {
			this.app.load(this.app.originalPath, {
				addToHistory: false
			})
		}
	}

	onKeyDown(e: KeyboardEvent) {
		let activeElement = document.activeElement

		// Ignore hotkeys on input elements
		switch(activeElement.tagName) {
			case "INPUT":
				//
				if(activeElement.id === "search" && e.keyCode === 13) {
					actions.search(this, activeElement as HTMLInputElement, e)
				}

				return

			case "TEXTAREA":
				return
		}

		// Ignore hotkeys on contentEditable elements
		if(activeElement.getAttribute("contenteditable") === "true") {
			// Disallow Enter key in contenteditables and make it blur the element instead
			if(e.keyCode === 13) {
				if("blur" in activeElement) {
					activeElement["blur"]()
				}

				e.preventDefault()
				e.stopPropagation()
			}

			return
		}

		// "Ctrl" + "," = Settings
		if(e.ctrlKey && e.keyCode === 188) {
			this.app.load("/settings")

			e.preventDefault()
			e.stopPropagation()
			return
		}

		// The following keycodes should not be activated while Ctrl is held down
		if(e.ctrlKey) {
			return
		}

		// "F" = Search
		if(e.keyCode === 70) {
			let search = document.getElementById("search") as HTMLInputElement

			search.focus()
			search.select()

			e.preventDefault()
			e.stopPropagation()
			return
		}

		// "S" = Toggle sidebar
		if(e.keyCode === 83) {
			this.sideBar.toggle()

			e.preventDefault()
			e.stopPropagation()
			return
		}

		// "+" = Audio speed up
		if(e.keyCode === 107 || e.keyCode === 187) {
			this.audioPlayer.addSpeed(0.05)

			e.preventDefault()
			e.stopPropagation()
			return
		}

		// "-" = Audio speed down
		if(e.keyCode === 109 || e.keyCode === 189) {
			this.audioPlayer.addSpeed(-0.05)

			e.preventDefault()
			e.stopPropagation()
			return
		}

		// "J" = Previous track
		if(e.keyCode === 74) {
			this.audioPlayer.previous()

			e.preventDefault()
			e.stopPropagation()
			return
		}

		// "K" = Play/pause
		if(e.keyCode === 75) {
			this.audioPlayer.playPause()

			e.preventDefault()
			e.stopPropagation()
			return
		}

		// "L" = Next track
		if(e.keyCode === 76) {
			this.audioPlayer.next()

			e.preventDefault()
			e.stopPropagation()
			return
		}
	}
}