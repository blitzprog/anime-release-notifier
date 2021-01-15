package arn

// Register a list of supported services.
func init() {
	DataLists["mapping-services"] = []*Option{
		{"anidb/anime", "anidb/anime"},
		{"anilist/anime", "anilist/anime"},
		{"anilist/character", "anilist/character"},
		{"anilist/studio", "anilist/studio"},
		{"ann/company", "ann/company"},
		{"imdb/anime", "imdb/anime"},
		{"kitsu/anime", "kitsu/anime"},
		{"kitsu/character", "kitsu/character"},
		{"myanimelist/anime", "myanimelist/anime"},
		{"myanimelist/character", "myanimelist/character"},
		{"myanimelist/producer", "myanimelist/producer"},
		{"shoboi/anime", "shoboi/anime"},
		{"thetvdb/anime", "thetvdb/anime"},
		{"trakt/anime", "trakt/anime"},
		{"trakt/season", "trakt/season"},
		{"tmdb/tv", "tmdb/tv"},
		{"tmdb/movie", "tmdb/movie"},
	}
}

// Mapping ...
type Mapping struct {
	Service   string `json:"service" editable:"true" datalist:"mapping-services"`
	ServiceID string `json:"serviceId" editable:"true"`
}

// Name ...
func (mapping *Mapping) Name() string {
	switch mapping.Service {
	case "anidb/anime":
		return "AniDB"
	case "anilist/anime":
		return "AniList"
	case "imdb/anime":
		return "IMDb"
	case "kitsu/anime":
		return "Kitsu"
	case "myanimelist/anime":
		return "MAL"
	case "shoboi/anime":
		return "Shoboi"
	case "thetvdb/anime":
		return "TVDB"
	case "trakt/anime":
		return "Trakt"
	case "trakt/season":
		return "Trakt"
	case "tmdb/tv":
		return "TMDb"
	case "tmdb/movie":
		return "TMDb"
	default:
		return mapping.Service
	}
}

// Link ...
func (mapping *Mapping) Link() string {
	switch mapping.Service {
	case "kitsu/anime":
		return "https://kitsu.io/anime/" + mapping.ServiceID
	case "shoboi/anime":
		return "http://cal.syoboi.jp/tid/" + mapping.ServiceID
	case "anilist/anime":
		return "https://anilist.co/anime/" + mapping.ServiceID
	case "anilist/character":
		return "https://anilist.co/character/" + mapping.ServiceID
	case "anilist/studio":
		return "https://anilist.co/studio/" + mapping.ServiceID
	case "imdb/anime":
		return "https://www.imdb.com/title/" + mapping.ServiceID
	case "myanimelist/anime":
		return "https://myanimelist.net/anime/" + mapping.ServiceID
	case "thetvdb/anime":
		return "https://thetvdb.com/?tab=series&id=" + mapping.ServiceID
	case "anidb/anime":
		return "https://anidb.net/perl-bin/animedb.pl?show=anime&aid=" + mapping.ServiceID
	case "trakt/anime":
		return "https://trakt.tv/shows/" + mapping.ServiceID
	case "trakt/season":
		return "https://trakt.tv/seasons/" + mapping.ServiceID
	case "tmdb/tv":
		return "https://www.themoviedb.org/tv/" + mapping.ServiceID
	case "tmdb/movie":
		return "https://www.themoviedb.org/movie/" + mapping.ServiceID
	default:
		return ""
	}
}
