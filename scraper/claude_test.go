package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// fakeAnthropicServer returns an httptest.Server that mimics the Anthropic Messages API
// shape, responding with the given text as a single content block.
func fakeAnthropicServer(t *testing.T, responseText string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(anthropicResponse{
			Content: []anthropicContentBlock{{Type: "text", Text: responseText}},
		})
	}))
	t.Cleanup(server.Close)
	return server
}

func withAnthropicBaseURL(t *testing.T, url string) {
	t.Helper()
	original := anthropicBaseURL
	anthropicBaseURL = url
	t.Cleanup(func() { anthropicBaseURL = original })
}

func TestCallClaudeReturnsErrNotConfiguredWithNoApiKey(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")

	_, err := callClaude("system", "user")

	if err != errNotConfigured {
		t.Fatalf("expected errNotConfigured, got %v", err)
	}
}

func TestCallClaudeReturnsResponseText(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{"hello":"world"}`)
	withAnthropicBaseURL(t, server.URL)

	text, err := callClaude("system", "user")

	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if text != `{"hello":"world"}` {
		t.Fatalf("unexpected text: %q", text)
	}
}

func TestCallClaudeMarksSystemPromptCacheable(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	var captured anthropicRequest
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&captured); err != nil {
			t.Fatalf("failed to decode captured request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(anthropicResponse{Content: []anthropicContentBlock{{Type: "text", Text: "ok"}}})
	}))
	defer server.Close()
	withAnthropicBaseURL(t, server.URL)

	if _, err := callClaude("system prompt", "user"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(captured.System) != 1 {
		t.Fatalf("expected exactly one system block, got %d", len(captured.System))
	}
	block := captured.System[0]
	if block.Text != "system prompt" {
		t.Fatalf("unexpected system text: %q", block.Text)
	}
	if block.CacheControl == nil || block.CacheControl.Type != "ephemeral" {
		t.Fatalf("expected an ephemeral cache_control block, got %+v", block.CacheControl)
	}
}

func TestCallClaudeReturnsErrorOnNonOKStatus(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()
	withAnthropicBaseURL(t, server.URL)

	_, err := callClaude("system", "user")

	if err == nil {
		t.Fatal("expected an error for a non-200 anthropic response")
	}
}

func TestStripJSONFence(t *testing.T) {
	cases := map[string]string{
		`{"a":1}`:                 `{"a":1}`,
		"```json\n{\"a\":1}\n```": `{"a":1}`,
		"```\n{\"a\":1}\n```":     `{"a":1}`,
		"  {\"a\":1}  ":           `{"a":1}`,
	}
	for input, want := range cases {
		if got := stripJSONFence(input); got != want {
			t.Errorf("stripJSONFence(%q) = %q, want %q", input, got, want)
		}
	}
}

func doPost(t *testing.T, handler http.HandlerFunc, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader([]byte(body)))
	w := httptest.NewRecorder()
	handler(w, req)
	return w
}

func TestAnalyzeResumeHandlerRequiresText(t *testing.T) {
	w := doPost(t, analyzeResumeHandler, `{}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestAnalyzeResumeHandlerReturns503WhenNotConfigured(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")

	w := doPost(t, analyzeResumeHandler, `{"text":"some resume text"}`)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "not_configured") {
		t.Fatalf("expected not_configured error, got %s", w.Body.String())
	}
}

func TestAnalyzeResumeHandlerReturns502WhenAnthropicErrors(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	withAnthropicBaseURL(t, server.URL)

	w := doPost(t, analyzeResumeHandler, `{"text":"some resume text"}`)

	if w.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "unavailable") {
		t.Fatalf("expected unavailable error, got %s", w.Body.String())
	}
}

func TestAnalyzeResumeHandlerParsesFencedJSON(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	analysisJSON := `{"summary":"Backend engineer with 5 years experience","skills":["Go","Postgres"],"seniority":"senior","roles":["Backend Engineer"]}`
	server := fakeAnthropicServer(t, "```json\n"+analysisJSON+"\n```")
	withAnthropicBaseURL(t, server.URL)

	w := doPost(t, analyzeResumeHandler, `{"text":"some resume text"}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var analysis resumeAnalysis
	if err := json.NewDecoder(w.Body).Decode(&analysis); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if analysis.Seniority != "senior" || len(analysis.Skills) != 2 {
		t.Fatalf("unexpected analysis: %+v", analysis)
	}
}

func TestMatchResumeHandlerRequiresJobTextAndResumes(t *testing.T) {
	w := doPost(t, matchResumeHandler, `{"jobDescriptionText":"a job", "resumes":[]}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty resumes, got %d", w.Code)
	}

	w2 := doPost(t, matchResumeHandler, `{"jobDescriptionText":"", "resumes":[{"id":"1"}]}`)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty job text, got %d", w2.Code)
	}
}

func TestMatchResumeHandlerReturnsVerdict(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{"bestResumeId":"1","recommendation":"APPLY","reasoning":"Strong skills match."}`)
	withAnthropicBaseURL(t, server.URL)

	body := `{"jobDescriptionText":"We need a backend engineer.","resumes":[{"id":"1","fileName":"resume.pdf","summary":"Backend engineer","skills":["Go"],"seniority":"senior","roles":["Backend Engineer"]}]}`
	w := doPost(t, matchResumeHandler, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var result matchResult
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result.BestResumeID != "1" || result.Recommendation != "APPLY" {
		t.Fatalf("unexpected result: %+v", result)
	}
}
