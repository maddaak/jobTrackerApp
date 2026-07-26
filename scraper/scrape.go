package main

import (
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/PuerkitoBio/goquery"
)

type scrapeRequest struct {
	URL string `json:"url"`
}

type scrapeResponse struct {
	Company  string `json:"company"`
	Role     string `json:"role"`
	Location string `json:"location"`
	CompMin  *int   `json:"compMin"`
	CompMax  *int   `json:"compMax"`
	Raw      string `json:"raw"`
}

var httpClient = &http.Client{Timeout: 8 * time.Second}

var compRegex = regexp.MustCompile(`(\$)?\s?([\d,]+)([kK])?\s*(?:-|–|to)\s*(\$)?\s?([\d,]+)([kK])?`)

const rawTextLimit = 8000

// greenhouseEmbedForPattern pulls the board token out of a Greenhouse embed script's src,
// e.g. "https://boards.greenhouse.io/embed/job_board/js?for=doubleverify" -> "doubleverify".
var greenhouseEmbedForPattern = regexp.MustCompile(`[?&]for=([a-zA-Z0-9_-]+)`)

// greenhouseBoardsAPIBaseURL is a package var (not a const) so tests can point it at a local
// httptest.Server instead of the real Greenhouse API.
var greenhouseBoardsAPIBaseURL = "https://boards-api.greenhouse.io"

type greenhouseJobResponse struct {
	Title       string `json:"title"`
	CompanyName string `json:"company_name"`
	Content     string `json:"content"`
	Location    struct {
		Name string `json:"name"`
	} `json:"location"`
}

func scrapeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var req scrapeRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	parsed, err := url.Parse(req.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		writeError(w, http.StatusBadRequest, "url must be http or https")
		return
	}

	result := scrapeResponse{}

	httpReq, err := http.NewRequest(http.MethodGet, req.URL, nil)
	if err == nil {
		httpReq.Header.Set("User-Agent",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36")
		resp, fetchErr := httpClient.Do(httpReq)
		if fetchErr == nil {
			defer resp.Body.Close()
			// A non-2xx response (404, 410, etc.) still has an HTTP body — Go's client
			// doesn't treat that as an error — so without this check a dead/removed
			// posting's error page gets scraped and extracted from as if it were real,
			// silently feeding garbage into the form and the AI match instead of
			// surfacing a fetch failure the user can react to.
			if resp.StatusCode >= 200 && resp.StatusCode < 300 {
				if doc, parseErr := goquery.NewDocumentFromReader(resp.Body); parseErr == nil {
					extract(doc, &result, req.URL)
				}
			}
		}
	}
	// Best-effort by design: a fetch/parse failure just leaves `result` at its zero
	// value (all blanks) — never a 500, the caller always gets a 200 to fill in manually.

	writeJSON(w, http.StatusOK, result)
}

func extract(doc *goquery.Document, result *scrapeResponse, requestURL string) {
	if extractFromJSONLD(doc, result) {
		// JSON-LD gave us structured fields; still run keyword classification over
		// whatever location text we found, and fall back to page text for comp/raw
		// if JSON-LD didn't have them.
	} else if !extractFromGreenhouseEmbed(doc, requestURL, result) {
		extractFromMetaAndTitle(doc, result)
	}

	bodyText := strings.TrimSpace(doc.Find("body").Text())
	if result.Raw == "" && looksLikeJobContent(bodyText) {
		result.Raw = truncate(collapseWhitespace(bodyText), rawTextLimit)
	}
	if result.CompMin == nil && result.CompMax == nil {
		if min, max, ok := extractCompRange(bodyText); ok {
			result.CompMin = &min
			result.CompMax = &max
		}
	}
	if result.Location == "" {
		result.Location = classifyLocation(bodyText)
	} else {
		result.Location = classifyLocation(result.Location)
	}
}

// jobContentSignalWords are words a real job posting almost always contains somewhere.
// The whole-page-body fallback in extract() is a last resort for sites we have no
// structured way to read — on a JS-rendered careers page (client-side widget, no JSON-LD,
// no known embed) that body text is just nav/footer/legal boilerplate, not the JD. Without
// this check that boilerplate gets accepted as "the job description" and silently fed to
// the AI match, which can only ever produce a nonsense verdict from it.
var jobContentSignalWords = []string{
	"responsibilit", "requirement", "qualification", "experience",
	"skill", "role", "position", "you will", "we are looking",
}

func looksLikeJobContent(text string) bool {
	lower := strings.ToLower(text)
	for _, word := range jobContentSignalWords {
		if strings.Contains(lower, word) {
			return true
		}
	}
	return false
}

// extractFromJSONLD looks for a <script type="application/ld+json"> block describing a
// schema.org JobPosting — most ATS platforms (Greenhouse/Lever/Ashby) embed one, and it's
// far more reliable than scraping visible text.
func extractFromJSONLD(doc *goquery.Document, result *scrapeResponse) bool {
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

func applyJobPosting(posting map[string]interface{}, result *scrapeResponse) {
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
		result.Raw = truncate(collapseWhitespace(stripHTML(desc)), rawTextLimit)
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

// extractFromMetaAndTitle is the fallback when no JobPosting JSON-LD is present: title-tag
// heuristics and Open Graph meta tags, both widely supported even by simple career pages.
// extractFromGreenhouseEmbed handles career pages that embed Greenhouse's client-side job
// board widget (<script src=".../embed/job_board/js?for=TOKEN">) instead of server-rendering
// the posting themselves — the widget renders everything via JS, so a plain HTML fetch only
// ever sees site chrome. Greenhouse also runs a public read-only jobs API, so this calls that
// directly using the embed's board token plus a job id pulled from the page URL's own query
// string — gh_jid is Greenhouse's documented param name for embeds; id is what some sites use
// instead (both seen in the wild, so both are tried).
func extractFromGreenhouseEmbed(doc *goquery.Document, requestURL string, result *scrapeResponse) bool {
	boardToken := ""
	doc.Find(`script[src*="boards.greenhouse.io/embed/job_board"]`).EachWithBreak(func(_ int, s *goquery.Selection) bool {
		src, ok := s.Attr("src")
		if !ok {
			return true
		}
		match := greenhouseEmbedForPattern.FindStringSubmatch(src)
		if match == nil {
			return true
		}
		boardToken = match[1]
		return false
	})
	if boardToken == "" {
		return false
	}

	parsed, err := url.Parse(requestURL)
	if err != nil {
		return false
	}
	jobID := parsed.Query().Get("gh_jid")
	if jobID == "" {
		jobID = parsed.Query().Get("id")
	}
	if jobID == "" {
		return false
	}

	apiURL := fmt.Sprintf("%s/v1/boards/%s/jobs/%s?content=true", greenhouseBoardsAPIBaseURL, boardToken, jobID)
	httpReq, err := http.NewRequest(http.MethodGet, apiURL, nil)
	if err != nil {
		return false
	}
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return false
	}

	var job greenhouseJobResponse
	if err := json.NewDecoder(resp.Body).Decode(&job); err != nil {
		return false
	}

	if result.Role == "" {
		result.Role = strings.TrimSpace(job.Title)
	}
	if result.Company == "" {
		result.Company = strings.TrimSpace(job.CompanyName)
	}

	// job.Content is HTML, itself HTML-entity-escaped by the API (e.g. "&lt;div&gt;") —
	// decode the entities first so stripHTML actually sees real tags to strip.
	contentText := collapseWhitespace(stripHTML(html.UnescapeString(job.Content)))
	if contentText != "" {
		result.Raw = truncate(contentText, rawTextLimit)
	}
	if result.Location == "" {
		lower := strings.ToLower(contentText)
		if strings.Contains(lower, "hybrid") || strings.Contains(lower, "remote") ||
			strings.Contains(lower, "onsite") || strings.Contains(lower, "on-site") {
			// Let the shared classifyLocation() call below pick the right value out of
			// this — the JD text is a more reliable signal than the bare office name.
			result.Location = contentText
		} else {
			result.Location = job.Location.Name
		}
	}
	if result.CompMin == nil && result.CompMax == nil {
		if min, max, ok := extractCompRange(contentText); ok {
			result.CompMin = &min
			result.CompMax = &max
		}
	}
	return result.Role != ""
}

func extractFromMetaAndTitle(doc *goquery.Document, result *scrapeResponse) {
	if siteName, ok := doc.Find(`meta[property="og:site_name"]`).Attr("content"); ok {
		result.Company = strings.TrimSpace(siteName)
	}

	pageTitle := strings.TrimSpace(doc.Find("title").First().Text())
	ogTitle := ""
	if v, ok := doc.Find(`meta[property="og:title"]`).Attr("content"); ok {
		ogTitle = strings.TrimSpace(v)
	}

	// og:title is often just the role with no "at Company" suffix (e.g. Greenhouse job
	// pages), while the <title> tag has the company but a noisier role prefix like "Job
	// Application for ...". Split both and take whichever half each one actually has,
	// preferring og:title since it's the cleaner source when it does have a separator.
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

// splitTitleHeuristic handles the common "Role at Company" / "Role - Company" page-title
// patterns job boards use.
func splitTitleHeuristic(title string) (role string, company string) {
	for _, sep := range []string{" at ", " - ", " | "} {
		if idx := strings.Index(title, sep); idx > 0 {
			return strings.TrimSpace(title[:idx]), strings.TrimSpace(title[idx+len(sep):])
		}
	}
	return title, ""
}

func classifyLocation(text string) string {
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

// extractCompRange scans for the first digit-range match that actually looks like a salary
// (has a $ or a k/K suffix on at least one side) rather than any bare "N - N" in the page —
// phone numbers, years ("2020-2024"), and "1-2 years experience" would otherwise all match.
func extractCompRange(text string) (int, int, bool) {
	for _, match := range compRegex.FindAllStringSubmatch(text, -1) {
		hasDollar := match[1] != "" || match[4] != ""
		hasK := match[3] != "" || match[6] != ""
		if !hasDollar && !hasK {
			continue
		}
		// A k/K suffix on either side means the whole range is in that shorthand —
		// "$100-150k" is $100k-$150k, not $100-$150,000.
		min, ok1 := parseCompNumber(match[2], hasK)
		max, ok2 := parseCompNumber(match[5], hasK)
		if !ok1 || !ok2 || min == 0 || max == 0 || min > max {
			continue
		}
		if !hasK && (min < 1000 || max < 1000) {
			// No shorthand and a sub-$1,000 figure — too small to be a real salary,
			// almost certainly a false positive (e.g. "1-2 years").
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

func truncate(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	// Back off to the start of a rune so a multi-byte UTF-8 character never gets cut in
	// half (which would otherwise leave a trailing garbled/replacement character).
	for limit > 0 && !utf8.RuneStart(s[limit]) {
		limit--
	}
	return s[:limit]
}

func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
