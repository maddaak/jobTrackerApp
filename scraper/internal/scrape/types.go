// Package scrape fetches a job posting and pulls company, role, location, and comp out of it.
package scrape

type request struct {
	URL string `json:"url"`
}

type response struct {
	Company  string `json:"company"`
	Role     string `json:"role"`
	Location string `json:"location"`
	CompMin  *int   `json:"compMin"`
	CompMax  *int   `json:"compMax"`
	Raw      string `json:"raw"`
	// Lets the caller tell a blocked host from a dead link from a page with no job data.
	Fetched bool   `json:"fetched"`
	Reason  string `json:"reason,omitempty"`
}

// Reasons a scrape produced nothing; the client maps these to a specific message.
const (
	reasonBlockedHost   = "blocked_host"
	reasonRequestFailed = "request_failed"
	reasonUnreachable   = "unreachable"
	reasonHTTPError     = "http_error"
	reasonUnreadable    = "unreadable"
	reasonNoJobData     = "no_job_data"
)
