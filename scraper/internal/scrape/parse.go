package scrape

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

var compRegex = regexp.MustCompile(`(\$)?\s?([\d,]+)([kK])?\s*(?:-|–|to)\s*(\$)?\s?([\d,]+)([kK])?`)

func classifyLocation(text string) string {
	// extract re-classifies its own output, and NYC_IN_PERSON misses the "in-person" check below.
	switch text {
	case "REMOTE", "NYC_HYBRID", "NYC_IN_PERSON":
		return text
	}
	lower := strings.ToLower(text)
	hybrid := strings.Contains(lower, "hybrid")
	if strings.Contains(lower, "remote") && !hybrid {
		return "REMOTE"
	}
	if hybrid {
		return "NYC_HYBRID"
	}
	if strings.Contains(lower, "onsite") || strings.Contains(lower, "on-site") ||
		strings.Contains(lower, "in-person") || strings.Contains(lower, "in office") {
		return "NYC_IN_PERSON"
	}
	return ""
}

// extractCompRange takes the first digit range with a $ or k, so phone numbers and year ranges don't match.
func extractCompRange(text string) (int, int, bool) {
	for _, match := range compRegex.FindAllStringSubmatch(text, -1) {
		hasDollar := match[1] != "" || match[4] != ""
		hasK := match[3] != "" || match[6] != ""
		if !hasDollar && !hasK {
			continue
		}
		// A k on either side applies to both: "$100-150k" is $100k-$150k.
		min, ok1 := parseCompNumber(match[2], hasK)
		max, ok2 := parseCompNumber(match[5], hasK)
		if !ok1 || !ok2 || min == 0 || max == 0 || min > max {
			continue
		}
		if !hasK && (min < 1000 || max < 1000) {
			// No shorthand and sub-$1,000: too small for a real salary, likely a false positive.
			continue
		}
		return min, max, true
	}
	return 0, 0, false
}

func parseCompNumber(digits string, applyKMultiplier bool) (int, bool) {
	clean := strings.ReplaceAll(digits, ",", "")
	n, err := strconv.Atoi(clean)
	if err != nil {
		return 0, false
	}
	if applyKMultiplier {
		n *= 1000
	}
	return n, true
}

func stripHTML(s string) string {
	if doc, err := goquery.NewDocumentFromReader(strings.NewReader(s)); err == nil {
		return doc.Text()
	}
	return s
}

func collapseWhitespace(s string) string {
	return strings.Join(strings.Fields(s), " ")
}
