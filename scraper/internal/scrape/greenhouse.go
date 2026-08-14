package scrape

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"github.com/PuerkitoBio/goquery"

	"jobtracker/scraper/internal/httpx"
	"jobtracker/scraper/internal/textutil"
)

// greenhouseEmbedForPattern pulls the board token from a Greenhouse embed script src (?for=...).
var greenhouseEmbedForPattern = regexp.MustCompile(`[?&]for=([a-zA-Z0-9_-]+)`)

// greenhouseJobIDPattern constrains the job id pulled from the page URL to digits only.
var greenhouseJobIDPattern = regexp.MustCompile(`^\d+$`)

// greenhouseBoardsAPIBaseURL is a package var so tests can point it at a local server.
var greenhouseBoardsAPIBaseURL = "https://boards-api.greenhouse.io"

type greenhouseJobResponse struct {
	Title       string `json:"title"`
	CompanyName string `json:"company_name"`
	Content     string `json:"content"`
	Location    struct {
		Name string `json:"name"`
	} `json:"location"`
}

// extractFromGreenhouseEmbed handles pages that only embed Greenhouse's widget by calling its jobs API with the board token and URL job id (gh_jid or id).
func extractFromGreenhouseEmbed(ctx context.Context, doc *goquery.Document, requestURL string, result *response) bool {
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
	// Constrain jobID to digits so a crafted query param can't inject path segments into the API URL.
	if !greenhouseJobIDPattern.MatchString(jobID) {
		return false
	}

	job, ok := fetchGreenhouseJob(ctx, boardToken, jobID)
	if !ok {
		return false
	}

	if result.Role == "" {
		result.Role = strings.TrimSpace(job.Title)
	}
	if result.Company == "" {
		result.Company = strings.TrimSpace(job.CompanyName)
	}

	// job.Content is entity-escaped HTML, so decode entities before stripHTML sees real tags.
	contentText := collapseWhitespace(stripHTML(html.UnescapeString(job.Content)))
	if contentText != "" {
		result.Raw = textutil.Truncate(contentText, rawTextLimit)
	}
	if result.Location == "" {
		lower := strings.ToLower(contentText)
		if strings.Contains(lower, "hybrid") || strings.Contains(lower, "remote") ||
			strings.Contains(lower, "onsite") || strings.Contains(lower, "on-site") {
			// Classify here rather than park a whole document in a location-typed field.
			result.Location = classifyLocation(contentText)
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

func fetchGreenhouseJob(ctx context.Context, boardToken, jobID string) (greenhouseJobResponse, bool) {
	var job greenhouseJobResponse

	apiURL := fmt.Sprintf("%s/v1/boards/%s/jobs/%s?content=true", greenhouseBoardsAPIBaseURL, boardToken, jobID)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return job, false
	}
	resp, err := httpClient.Do(httpReq)
	if err != nil {
		return job, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return job, false
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, httpx.MaxBodyBytes)).Decode(&job); err != nil {
		return job, false
	}
	return job, true
}
