package scrape

import (
	"encoding/json"
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
	if org, ok := posting["hiringOrganization"].(map[string]interface{}); ok {
		if name, ok := org["name"].(string); ok {
			result.Company = strings.TrimSpace(name)
		}
	}
	result.Location = jobLocationText(posting)
	if min, max, ok := baseSalaryRange(posting); ok {
		result.CompMin = &min
		result.CompMax = &max
	}
	if desc, ok := posting["description"].(string); ok {
		result.Raw = textutil.Truncate(collapseWhitespace(stripHTML(desc)), rawTextLimit)
	}
}

func jobLocationText(posting map[string]interface{}) string {
	if locType, ok := posting["jobLocationType"].(string); ok && strings.EqualFold(locType, "TELECOMMUTE") {
		return "remote"
	}
	loc := posting["jobLocation"]
	if list, ok := loc.([]interface{}); ok && len(list) > 0 {
		loc = list[0]
	}
	locMap, ok := loc.(map[string]interface{})
	if !ok {
		return ""
	}
	address, ok := locMap["address"].(map[string]interface{})
	if !ok {
		return ""
	}
	parts := []string{}
	for _, key := range []string{"addressLocality", "addressRegion"} {
		if s, ok := address[key].(string); ok && s != "" {
			parts = append(parts, s)
		}
	}
	return strings.Join(parts, ", ")
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
	min, minOK := numericValue(value["minValue"])
	max, maxOK := numericValue(value["maxValue"])
	if minOK && maxOK {
		return min, max, true
	}
	if single, ok := numericValue(value["value"]); ok {
		return single, single, true
	}
	return 0, 0, false
}

func numericValue(v interface{}) (int, bool) {
	switch n := v.(type) {
	case float64:
		return int(n), true
	case string:
		clean := strings.ReplaceAll(n, ",", "")
		if i, err := strconv.Atoi(clean); err == nil {
			return i, true
		}
	}
	return 0, false
}
