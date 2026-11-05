package scrape

import (
	"regexp"
	"strconv"
	"strings"

	"github.com/PuerkitoBio/goquery"
)

var compRegex = regexp.MustCompile(`(\$)?\s?([\d,]+)([kK])?\s*(?:-|–|to)\s*(\$)?\s?([\d,]+)([kK])?`)

const minAnnualSalary = 20000

// Checked before "remote", which each of these contains.
var notRemotePhrases = []string{"not remote", "non-remote", "no remote"}

func classifyLocation(text string) string {
	// extract re-classifies its own output, and ON_SITE misses the "on-site" check below.
	switch text {
	case "REMOTE", "HYBRID", "ON_SITE":
		return text
	}
	lower := strings.ToLower(text)
	if strings.Contains(lower, "hybrid") {
		return "HYBRID"
	}
	notRemote := false
	for _, phrase := range notRemotePhrases {
		notRemote = notRemote || strings.Contains(lower, phrase)
	}
	if strings.Contains(lower, "remote") && !notRemote {
		return "REMOTE"
	}
	for _, phrase := range []string{"onsite", "on-site", "on site", "in-person", "in person", "in office", "in-office"} {
		if strings.Contains(lower, phrase) {
			return "ON_SITE"
		}
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
		// A k on either side applies to both, since "$100-150k" means $100k-$150k.
		min, ok1 := parseCompNumber(match[2], hasK)
		max, ok2 := parseCompNumber(match[5], hasK)
		if !ok1 || !ok2 || min == 0 || max == 0 || min > max {
			continue
		}
		// Below this it's a bonus, stipend, or hourly rate ("$5-10k signing"), not the annual pay the table holds.
		if max < minAnnualSalary {
			continue
		}
		return min, max, true
	}
	return 0, 0, false
}

// FromText reads what plain text alone gives: the title, the work model, and a pay range. The company is
// left to the AI recommendation, since a posting names it in too many ways to pick out reliably.
func FromText(text string) (role, location string, compMin, compMax *int) {
	if min, max, ok := extractCompRange(text); ok {
		compMin, compMax = &min, &max
	}
	return titleFromText(text), classifyLocation(text), compMin, compMax
}

var titleLabel = regexp.MustCompile(`(?im)^[ \t]*(?:job title|position title|title|position|role)[ \t]*:[ \t]*(.{3,100}?)[ \t]*$`)

// Nearly every job title has one, so a first line without one is a company name or a greeting.
var titleWords = regexp.MustCompile(`(?i)\b(engineer|developer|programmer|manager|designer|analyst|scientist|researcher|director|architect|lead|specialist|consultant|administrator|coordinator|recruiter|intern|head of|vp|officer|associate|representative|technician|writer|editor|sre|devops)\b`)

// A "Title:" line wins; otherwise a posting usually opens with its title. A sentence is never a title.
func titleFromText(text string) string {
	if m := titleLabel.FindStringSubmatch(text); m != nil && !strings.HasSuffix(m[1], ".") {
		return m[1]
	}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if len(line) <= 80 && !strings.HasSuffix(line, ".") && titleWords.MatchString(line) {
			return line
		}
		return ""
	}
	return ""
}

func parseCompNumber(digits string, applyKMultiplier bool) (int, bool) {
	clean := strings.ReplaceAll(digits, ",", "")
	n, err := strconv.Atoi(clean)
	if err != nil {
		return 0, false
	}
	// Only shorthand is multiplied, or a mixed range like "$120k - $150,000" reads as $150M.
	if applyKMultiplier && n < 1000 {
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
