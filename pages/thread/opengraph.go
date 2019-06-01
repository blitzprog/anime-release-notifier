package thread

import (
	"github.com/aerogo/aero"
	"github.com/animenotifier/arn"
	"github.com/animenotifier/notify.moe/assets"
	"github.com/animenotifier/notify.moe/utils"
)

func getOpenGraph(ctx aero.Context, thread *arn.Thread) *arn.OpenGraph {
	openGraph := &arn.OpenGraph{
		Tags: map[string]string{
			"og:title":       thread.Title,
			"og:description": utils.CutLongDescription(thread.Text),
			"og:url":         "https://" + assets.Domain + thread.Link(),
			"og:site_name":   assets.Domain,
			"og:type":        "article",
		},
	}

	return openGraph
}
