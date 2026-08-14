package ai

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

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
	StatusHandler(w, req)

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
	StatusHandler(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if body := w.Body.String(); !strings.Contains(body, `"configured":true`) {
		t.Fatalf("expected body to contain \"configured\":true, got %q", body)
	}
}

func TestAnalyzeResumeHandlerRequiresText(t *testing.T) {
	w := doPost(t, AnalyzeResumeHandler, `{}`)

	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", w.Code)
	}
}

func TestAnalyzeResumeHandlerReturns503WhenNotConfigured(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")

	w := doPost(t, AnalyzeResumeHandler, `{"text":"some resume text"}`)

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

	w := doPost(t, AnalyzeResumeHandler, `{"text":"some resume text"}`)

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

	w := doPost(t, AnalyzeResumeHandler, `{"text":"some resume text"}`)

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
	w := doPost(t, MatchResumeHandler, `{"jobDescriptionText":"a job", "resumes":[]}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty resumes, got %d", w.Code)
	}

	w2 := doPost(t, MatchResumeHandler, `{"jobDescriptionText":"", "resumes":[{"id":"1","fileName":"a.pdf","fullText":"..."}]}`)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty job text, got %d", w2.Code)
	}
}

func TestMatchResumeHandlerRejectsTooManyResumes(t *testing.T) {
	var resumes strings.Builder
	resumes.WriteString(`{"jobDescriptionText":"a real job description","resumes":[`)
	for i := 0; i <= maxResumes; i++ {
		if i > 0 {
			resumes.WriteString(",")
		}
		fmt.Fprintf(&resumes, `{"id":"%d","fileName":"a.pdf","fullText":"resume text"}`, i)
	}
	resumes.WriteString(`]}`)

	w := doPost(t, MatchResumeHandler, resumes.String())
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for more than maxResumes resumes, got %d", w.Code)
	}
}

func TestRecommendResumeVariantHandlerRejectsTooManyVariants(t *testing.T) {
	var variants strings.Builder
	variants.WriteString(`{"jobDescriptionText":"a real job description","variants":[`)
	for i := 0; i <= maxResumeVariants; i++ {
		if i > 0 {
			variants.WriteString(",")
		}
		fmt.Fprintf(&variants, `{"id":"%d","displayName":"V","blurb":"b"}`, i)
	}
	variants.WriteString(`]}`)

	w := doPost(t, RecommendResumeVariantHandler, variants.String())
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for more than maxResumeVariants variants, got %d", w.Code)
	}
}

func TestMatchResumeHandlerReturns503WhenNotConfigured(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")
	body := `{"jobDescriptionText":"a real job description","resumes":[{"id":"1","fileName":"a.pdf","fullText":"resume text"}]}`
	w := doPost(t, MatchResumeHandler, body)
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
	w := doPost(t, MatchResumeHandler, body)

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
	w := doPost(t, MatchResumeHandler, body)

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
	w := doPost(t, MatchResumeHandler, body)

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
	w := doPost(t, RecommendResumeVariantHandler, body)

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
	w := doPost(t, RecommendResumeVariantHandler, `{"jobDescriptionText":"a job", "variants":[]}`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty variants, got %d", w.Code)
	}

	w2 := doPost(t, RecommendResumeVariantHandler, `{"jobDescriptionText":"", "variants":[{"id":"base"}]}`)
	if w2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty job text, got %d", w2.Code)
	}
}

func TestRecommendResumeVariantHandlerReturns503WhenNotConfigured(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "")

	body := `{"jobDescriptionText":"We need a CI/CD platform engineer.","variants":[{"id":"base","displayName":"Base","blurb":"General backend."}]}`
	w := doPost(t, RecommendResumeVariantHandler, body)

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
	w := doPost(t, RecommendResumeVariantHandler, body)

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

// F49: a syntactically valid but semantically empty parse used to be returned as a real result.
// "{}" unmarshals cleanly into every one of these structs, so each handler must reject it.

func TestAnalyzeResumeHandlerRejectsEmptySummary(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{}`)
	withAnthropicBaseURL(t, server.URL)

	w := doPost(t, AnalyzeResumeHandler, `{"text":"Backend engineer with Go experience."}`)

	// Previously this returned 200 with summary:"", stored upstream as analysisStatus "ok".
	if w.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 for an empty summary, got %d: %s", w.Code, w.Body.String())
	}
}

func TestMatchResumeHandlerRejectsUnknownRecommendation(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{"bestResumeId":"1","reasoning":"..."}`)
	withAnthropicBaseURL(t, server.URL)

	body := `{"jobDescriptionText":"We need a backend engineer.",` +
		`"resumes":[{"id":"1","fileName":"resume.pdf","fullText":"Backend engineer with Go experience."}]}`
	w := doPost(t, MatchResumeHandler, body)

	// An empty recommendation rendered as "You should not apply" in the UI.
	if w.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 for a missing recommendation, got %d: %s", w.Code, w.Body.String())
	}
}

func TestRecommendResumeVariantHandlerRejectsEmptyReason(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{"variantId":"backend"}`)
	withAnthropicBaseURL(t, server.URL)

	body := `{"jobDescriptionText":"We need a backend engineer.",` +
		`"variants":[{"id":"backend","displayName":"Backend","blurb":"Go and Java"}]}`
	w := doPost(t, RecommendResumeVariantHandler, body)

	if w.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 for an empty reason, got %d: %s", w.Code, w.Body.String())
	}
}
