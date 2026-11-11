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
	zeroBackoff(t)
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
	server := fakeAnthropicServer(t, `{"bestResumeId":"1","recommendation":"APPLY","company":" Initech ","role":"Backend Engineer","strengths":["Go"]}`)
	withAnthropicBaseURL(t, server.URL)

	body := `{"jobDescriptionText":"We need a backend engineer.",` +
		`"resumes":[{"id":"1","fileName":"resume.pdf","fullText":"Backend engineer with Go experience."}]}`
	w := doPost(t, MatchResumeHandler, body)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	// A missing list must reach the form as [], not null.
	if !strings.Contains(w.Body.String(), `"gaps":[]`) {
		t.Errorf("expected an empty gaps list, got %s", w.Body.String())
	}
	var result matchResult
	if err := json.NewDecoder(w.Body).Decode(&result); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if result.BestResumeID != "1" || result.Recommendation != "APPLY" || result.Company != "Initech" || result.Role != "Backend Engineer" {
		t.Fatalf("unexpected result: %+v", result)
	}
}

func TestMatchResumeHandlerPassesThroughInsufficientJD(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	server := fakeAnthropicServer(t, `{"bestResumeId":"","recommendation":"INSUFFICIENT_JD","strengths":[],"gaps":[]}`)
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
	server := fakeAnthropicServer(t, `{"bestResumeId":"99","recommendation":"APPLY","strengths":["x"]}`)
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

func TestMatchResumeHandlerRejectsAVerdictItCannotShow(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	body := `{"jobDescriptionText":"We need a backend engineer.",` +
		`"resumes":[{"id":"1","fileName":"resume.pdf","fullText":"Backend engineer with Go experience."}]}`

	// An empty recommendation rendered as "not recommended"; a verdict with nothing behind it can't be judged.
	for _, reply := range []string{
		`{"bestResumeId":"1","strengths":["Go"]}`,
		`{"bestResumeId":"1","recommendation":"MAYBE","strengths":["Go"]}`,
		`{"bestResumeId":"1","recommendation":"APPLY","gaps":["Rust"]}`,
		`{"bestResumeId":"1","recommendation":"DO_NOT_APPLY","strengths":["Go"]}`,
	} {
		withAnthropicBaseURL(t, fakeAnthropicServer(t, reply).URL)
		if w := doPost(t, MatchResumeHandler, body); w.Code != http.StatusBadGateway {
			t.Errorf("reply %s: expected 502, got %d: %s", reply, w.Code, w.Body.String())
		}
	}
}
