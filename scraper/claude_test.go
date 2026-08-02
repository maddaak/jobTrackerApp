package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// zeroClaudeBackoff removes the retry backoff sleep for the duration of a test so the retry
// path can be exercised without waiting.
func zeroClaudeBackoff(t *testing.T) {
	t.Helper()
	original := claudeRetryBackoffBase
	claudeRetryBackoffBase = 0
	t.Cleanup(func() { claudeRetryBackoffBase = original })
}

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

	_, err := callClaude(context.Background(), "system", "user", 1024)

	if err != errNotConfigured {
		t.Fatalf("expected errNotConfigured, got %v", err)
	}
}

func TestCallClaudeReturnsResponseText(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{"hello":"world"}`)
	withAnthropicBaseURL(t, server.URL)

	text, err := callClaude(context.Background(), "system", "user", 1024)

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

	if _, err := callClaude(context.Background(), "system prompt", "user", 1024); err != nil {
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
	zeroClaudeBackoff(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer server.Close()
	withAnthropicBaseURL(t, server.URL)

	// 429 is transient, so callClaude retries and then returns the final error.
	_, err := callClaude(context.Background(), "system", "user", 1024)

	if err == nil {
		t.Fatal("expected an error for a non-200 anthropic response")
	}
}

func TestExtractJSON(t *testing.T) {
	cases := map[string]string{
		`{"a":1}`:                        `{"a":1}`,
		"```json\n{\"a\":1}\n```":        `{"a":1}`,
		"```\n{\"a\":1}\n```":            `{"a":1}`,
		"  {\"a\":1}  ":                  `{"a":1}`,
		"Here is the JSON:\n{\"a\":1}":   `{"a":1}`,
		"{\"a\":1}\nHope that helps!":    `{"a":1}`,
	}
	for input, want := range cases {
		if got := extractJSON(input); got != want {
			t.Errorf("extractJSON(%q) = %q, want %q", input, got, want)
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

func TestAIStatusHandlerReportsNotConfigured(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")

	req := httptest.NewRequest(http.MethodGet, "/ai-status", nil)
	w := httptest.NewRecorder()
	aiStatusHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if body := w.Body.String(); !strings.Contains(body, `"configured":false`) {
		t.Fatalf("expected body to contain \"configured\":false, got %q", body)
	}
}

func TestAIStatusHandlerReportsConfigured(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "sk-test-key")

	req := httptest.NewRequest(http.MethodGet, "/ai-status", nil)
	w := httptest.NewRecorder()
	aiStatusHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if body := w.Body.String(); !strings.Contains(body, `"configured":true`) {
		t.Fatalf("expected body to contain \"configured\":true, got %q", body)
	}
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
	zeroClaudeBackoff(t)
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

	w2 := doPost(t, matchResumeHandler, `{"jobDescriptionText":"", "resumes":[{"id":"1","fileName":"a.pdf","fullText":"..."}]}`)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty job text, got %d", w2.Code)
	}
}

func TestMatchResumeHandlerReturns503WhenNotConfigured(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	body := `{"jobDescriptionText":"a real job description","resumes":[{"id":"1","fileName":"a.pdf","fullText":"resume text"}]}`
	w := doPost(t, matchResumeHandler, body)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when no anthropic key, got %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), "not_configured") {
		t.Fatalf("expected not_configured error, got %s", w.Body.String())
	}
}

func TestMatchResumeHandlerReturnsVerdict(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{"bestResumeId":"1","recommendation":"APPLY","reasoning":"Strong skills match."}`)
	withAnthropicBaseURL(t, server.URL)

	body := `{"jobDescriptionText":"We need a backend engineer.",` +
		`"resumes":[{"id":"1","fileName":"resume.pdf","fullText":"Backend engineer with Go experience."}]}`
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

func TestMatchResumeHandlerPassesThroughInsufficientJD(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{"bestResumeId":"","recommendation":"INSUFFICIENT_JD","reasoning":"Text is website navigation markup, not a job description."}`)
	withAnthropicBaseURL(t, server.URL)

	body := `{"jobDescriptionText":"Home About Careers Contact Accept cookies",` +
		`"resumes":[{"id":"1","fileName":"resume.pdf","fullText":"Backend engineer with Go experience."}]}`
	w := doPost(t, matchResumeHandler, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var result matchResult
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result.Recommendation != "INSUFFICIENT_JD" {
		t.Fatalf("unexpected recommendation: %+v", result)
	}
}

func TestMatchResumeHandlerCoercesUnknownBestResumeID(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	// Claude returns id "99", which was never in the request; it must be coerced to "".
	server := fakeAnthropicServer(t, `{"bestResumeId":"99","recommendation":"APPLY","reasoning":"x"}`)
	withAnthropicBaseURL(t, server.URL)

	body := `{"jobDescriptionText":"We need a backend engineer.",` +
		`"resumes":[{"id":"1","fileName":"resume.pdf","fullText":"Backend engineer with Go experience."}]}`
	w := doPost(t, matchResumeHandler, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var result matchResult
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result.BestResumeID != "" {
		t.Fatalf("expected phantom id coerced to empty, got %q", result.BestResumeID)
	}
}

func TestRecommendResumeVariantHandlerCoercesUnknownVariantID(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	// Claude returns a variant id that wasn't provided; it must be coerced to "".
	server := fakeAnthropicServer(t, `{"variantId":"ghost","reason":"x"}`)
	withAnthropicBaseURL(t, server.URL)

	body := `{"jobDescriptionText":"We need a CI/CD platform engineer.",` +
		`"variants":[{"id":"base","displayName":"Base","blurb":"General backend."}]}`
	w := doPost(t, recommendResumeVariantHandler, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var result recommendVariantResult
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result.VariantID != "" {
		t.Fatalf("expected phantom id coerced to empty, got %q", result.VariantID)
	}
}

func TestRecommendResumeVariantHandlerRequiresJobTextAndVariants(t *testing.T) {
	w := doPost(t, recommendResumeVariantHandler, `{"jobDescriptionText":"a job", "variants":[]}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty variants, got %d", w.Code)
	}

	w2 := doPost(t, recommendResumeVariantHandler, `{"jobDescriptionText":"", "variants":[{"id":"base"}]}`)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty job text, got %d", w2.Code)
	}
}

func TestRecommendResumeVariantHandlerReturns503WhenNotConfigured(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")

	body := `{"jobDescriptionText":"We need a CI/CD platform engineer.","variants":[{"id":"base","displayName":"Base","blurb":"General backend."}]}`
	w := doPost(t, recommendResumeVariantHandler, body)

	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", w.Code)
	}
}

func TestRecommendResumeVariantHandlerReturnsVerdict(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{"variantId":"adobe","reason":"Job emphasizes CI/CD and platform tooling."}`)
	withAnthropicBaseURL(t, server.URL)

	body := `{"jobDescriptionText":"We need a CI/CD platform engineer.",` +
		`"variants":[{"id":"base","displayName":"Base","blurb":"General backend."},` +
		`{"id":"adobe","displayName":"Adobe Developer Productivity","blurb":"CI/CD and platform tooling."}]}`
	w := doPost(t, recommendResumeVariantHandler, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var result recommendVariantResult
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result.VariantID != "adobe" {
		t.Fatalf("unexpected result: %+v", result)
	}
}
