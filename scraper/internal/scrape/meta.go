package scrape

import (
	"strings"

	"github.com/PuerkitoBio/goquery"
)

func extractFromMetaAndTitle(doc *goquery.Document, result *response) {
	// Fill-only, like every field below: this runs after JSON-LD and must not overwrite what it found.
	if siteName, ok := doc.Find(`meta[property="og:site_name"]`).Attr("content"); ok && result.Company == "" {
		result.Company = strings.TrimSpace(siteName)
	}

	pageTitle := strings.TrimSpace(doc.Find("title").First().Text())
	ogTitle := ""
	if v, ok := doc.Find(`meta[property="og:title"]`).Attr("content"); ok {
		ogTitle = strings.TrimSpace(v)
	}

	// og:title is often role-only while <title> carries the company; take whichever half each has, preferring og:title.
	ogRole, ogCompany := splitTitleHeuristic(ogTitle)
	pageRole, pageCompany := splitTitleHeuristic(pageTitle)

	role := ogRole
	if role == "" {
		role = pageRole
	}
	company := ogCompany
	if company == "" {
		company = pageCompany
	}

	if result.Role == "" {
		result.Role = role
	}
	if result.Company == "" {
		result.Company = company
	}
}

func splitTitleHeuristic(title string) (role string, company string) {
	for _, sep := range []string{" at ", " - ", " | "} {
		if idx := strings.Index(title, sep); idx > 0 {
			return strings.TrimSpace(title[:idx]), strings.TrimSpace(title[idx+len(sep):])
		}
	}
	return title, ""
}
