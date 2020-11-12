package arn

import (
	"errors"
	"fmt"
	"github.com/aerogo/aero"
	"github.com/aerogo/api"
	"github.com/aerogo/markdown"
	"github.com/animenotifier/notify.moe/arn/autocorrect"
	"reflect"
)

// Force interface implementations
var (
	_ Postable          = (*Thread)(nil)
	_ Likeable          = (*Thread)(nil)
	_ LikeEventReceiver = (*Thread)(nil)
	_ Lockable          = (*Thread)(nil)
	_ LockEventReceiver = (*Thread)(nil)
	_ PostParent        = (*Thread)(nil)
	_ fmt.Stringer      = (*Thread)(nil)
	_ api.Newable       = (*Thread)(nil)
	_ api.Editable      = (*Thread)(nil)
	_ api.Actionable    = (*Thread)(nil)
	_ api.Deletable     = (*Thread)(nil)
)

// Actions
func init() {
	API.RegisterActions("Thread", []*api.Action{
		// Like thread
		LikeAction(),

		// Unlike thread
		UnlikeAction(),

		// Lock thread
		LockAction(),

		// Unlock thread
		UnlockAction(),
	})
}

// Authorize returns an error if the given API POST request is not authorized.
func (thread *Thread) Authorize(ctx aero.Context, action string) error {
	if !ctx.HasSession() {
		return errors.New("Neither logged in nor in session")
	}

	if action == "edit" {
		user := GetUserFromContext(ctx)

		if thread.CreatedBy != user.ID && user.Role != "admin" {
			return errors.New("Can't edit the threads of other users")
		}
	}

	return nil
}

// Create sets the data for a new thread with data we received from the API request.
func (thread *Thread) Create(ctx aero.Context) error {
	data, err := ctx.Request().Body().JSONObject()

	if err != nil {
		return err
	}

	userID, ok := ctx.Session().Get("userId").(string)

	if !ok || userID == "" {
		return errors.New("Not logged in")
	}

	user, err := GetUser(userID)

	if err != nil {
		return err
	}

	thread.ID = GenerateID("Thread")
	thread.Title, _ = data["title"].(string)
	thread.Text, _ = data["text"].(string)
	thread.CreatedBy = user.ID
	thread.Sticky, _ = data["sticky"].(int)
	thread.Created = DateTimeUTC()
	thread.Edited = ""

	// Post-process text
	thread.Title = autocorrect.ThreadTitle(thread.Title)
	thread.Text = autocorrect.PostText(thread.Text)

	// Tags
	tags, _ := data["tags"].([]interface{})
	thread.Tags = make([]string, len(tags))

	for i := range thread.Tags {
		thread.Tags[i] = tags[i].(string)
	}

	if len(tags) < 1 {
		return errors.New("Need to specify at least one tag")
	}

	if len(thread.Title) < 10 {
		return errors.New("Title too short: Should be at least 10 characters")
	}

	if len(thread.Text) < 10 {
		return errors.New("Text too short: Should be at least 10 characters")
	}

	// Write log entry
	logEntry := NewEditLogEntry(user.ID, "create", "Thread", thread.ID, "", "", "")
	logEntry.Save()

	// Create activity
	activity := NewActivityCreate("Thread", thread.ID, user.ID)
	activity.Save()

	return nil
}

// Edit creates an edit log entry.
func (thread *Thread) Edit(ctx aero.Context, key string, value reflect.Value, newValue reflect.Value) (consumed bool, err error) {

	switch key {
	case "Tags":
		newTags := newValue.Interface().([]string)

		if len(newTags) < 1 {
			return true, errors.New("Need to specify at least one tag")
		}

	case "Title":
		newTitle := newValue.String()

		if len(newTitle) < 10 {
			return true, errors.New("Title too short: Should be at least 10 characters")
		}
	case "Text":
		newText := newValue.String()

		if len(newText) < 10 {
			return true, errors.New("Text too short: Should be at least 10 characters")
		}
	}

	return edit(thread, ctx, key, value, newValue)
}

// OnAppend saves a log entry.
func (thread *Thread) OnAppend(ctx aero.Context, key string, index int, obj interface{}) {
	onAppend(thread, ctx, key, index, obj)
}

// OnRemove saves a log entry.
func (thread *Thread) OnRemove(ctx aero.Context, key string, index int, obj interface{}) {
	onRemove(thread, ctx, key, index, obj)
}

// AfterEdit sets the edited date on the thread object.
func (thread *Thread) AfterEdit(ctx aero.Context) error {
	thread.Edited = DateTimeUTC()
	thread.html = markdown.Render(thread.Text)
	return nil
}

// Save saves the thread object in the database.
func (thread *Thread) Save() {
	DB.Set("Thread", thread.ID, thread)
}

// DeleteInContext deletes the thread in the given context.
func (thread *Thread) DeleteInContext(ctx aero.Context) error {
	user := GetUserFromContext(ctx)

	// Write log entry
	logEntry := NewEditLogEntry(user.ID, "delete", "Thread", thread.ID, "", fmt.Sprint(thread), "")
	logEntry.Save()

	return thread.Delete()
}

// Delete deletes the thread and its posts from the database.
func (thread *Thread) Delete() error {
	for _, post := range thread.Posts() {
		err := post.Delete()

		if err != nil {
			return err
		}
	}

	// Remove activities
	for activity := range StreamActivityCreates() {
		if activity.ObjectID == thread.ID && activity.ObjectType == "Thread" {
			err := activity.Delete()

			if err != nil {
				return err
			}
		}
	}

	DB.Delete("Thread", thread.ID)
	return nil
}
