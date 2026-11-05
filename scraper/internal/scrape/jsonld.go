package scrape

import (
	"encoding/json"
	"html"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"

	"jobtracker/scraper/internal/textutil"
)

// extractFromJSONLD reads a schema.org JobPosting from ld+json, far more reliable than visible text.
func extractFromJSONLD(doc *goquery.Document, result *response) bool {
	found := false
	doc.Find(`script[type="application/ld+json"]`).EachWithBreak(func(_ int, s *goquery.Selection) bool {
		var raw interface{}
		if err := json.Unmarshal([]byte(s.Text()), &raw); err != nil {
			return true
		}
		posting := findJobPosting(raw)
		if posting == nil {
			return true
		}
		applyJobPosting(posting, result)
		found = true
		return false
	})
	return found
}

func findJobPosting(node interface{}) map[string]interface{} {
	switch v := node.(type) {
	case map[string]interface{}:
		if typeIs(v["@type"], "JobPosting") {
			return v
		}
		if graph, ok := v["@graph"].([]interface{}); ok {
			for _, item := range graph {
				if posting := findJobPosting(item); posting != nil {
					return posting
				}
			}
		}
	case []interface{}:
		for _, item := range v {
			if posting := findJobPosting(item); posting != nil {
				return posting
			}
		}
	}
	return nil
}

func typeIs(value interface{}, want string) bool {
	switch v := value.(type) {
	case string:
		return v == want
	case []interface{}:
		for _, item := range v {
			if s, ok := item.(string); ok && s == want {
				return true
			}
		}
	}
	return false
}

func applyJobPosting(posting map[string]interface{}, result *response) {
	if title, ok := posting["title"].(string); ok {
		result.Role = strings.TrimSpace(title)
	}
	// An object with a name, or the name alone. An @id reference names nothing here; the meta fallback fills it.
	switch org := posting["hiringOrganization"].(type) {
	case map[string]interface{}:
		if name, ok := org["name"].(string); ok {
			result.Company = strings.TrimSpace(name)
		}
	case string:
		result.Company = strings.TrimSpace(org)
	}
	// Location is a work model, not a place: an address can't say remote or hybrid, but TELECOMMUTE can.
	if locType, ok := posting["jobLocationType"].(string); ok && strings.EqualFold(locType, "TELECOMMUTE") {
		result.Location = "REMOTE"
	}
	result.City = postingCity(posting["jobLocation"])
	if min, max, ok := baseSalaryRange(posting); ok {
		result.CompMin = &min
		result.CompMax = &max
	}
	if desc, ok := posting["description"].(string); ok {
		// Many sites entity-escape the HTML inside JSON-LD; stripping it unescaped left literal tags in the JD.
		result.Raw = textutil.Truncate(collapseWhitespace(stripHTML(html.UnescapeString(desc))), rawTextLimit)
	}
}

// A posting open in several places lists each; the first is the one it leads with.
func postingCity(jobLocation interface{}) string {
	if places, ok := jobLocation.([]interface{}); ok && len(places) > 0 {
		jobLocation = places[0]
	}
	place, _ := jobLocation.(map[string]interface{})
	address, _ := place["address"].(map[string]interface{})
	locality, _ := address["addressLocality"].(string)
	region, _ := address["addressRegion"].(string)
	locality, region = strings.TrimSpace(locality), strings.TrimSpace(region)
	if locality != "" && region != "" {
		return locality + ", " + region
	}
	return locality
}

func baseSalaryRange(posting map[string]interface{}) (int, int, bool) {
	salary, ok := posting["baseSalary"].(map[string]interface{})
	if !ok {
		return 0, 0, false
	}
	value, ok := salary["value"].(map[string]interface{})
	if !ok {
		return 0, 0, false
	}
	// The table holds annual pay, so an hourly or monthly figure is scaled up rather than read as a year's.
	unit, _ := value["unitText"].(string)
	if unit == "" {
		unit, _ = salary["unitText"].(string)
	}
	perYear, known := annualMultiplier[strings.ToUpper(unit)]
	if !known {
		return 0, 0, false
	}
	min, minOK := numericValue(value["minValue"])
	max, maxOK := numericValue(value["maxValue"])
	if !minOK || !maxOK {
		single, ok := numericValue(value["value"])
		if !ok {
			return 0, 0, false
		}
		min, max = single, single
	}
	if min <= 0 || min > max {
		return 0, 0, false
	}
	return int(min * perYear), int(max * perYear), true
}

// Full-time hours, days and weeks per year; a blank unit is taken as annual, which is how most postings mean it.
var annualMultiplier = map[string]float64{
	"": 1, "YEAR": 1, "MONTH": 12, "WEEK": 52, "DAY": 260, "HOUR": 2080,
}

func numericValue(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case string:
		if f, err := strconv.ParseFloat(strings.ReplaceAll(n, ",", ""), 64); err == nil {
			return f, true
		}
	}
	return 0, false
}
