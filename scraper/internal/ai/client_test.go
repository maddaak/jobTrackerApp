package ai

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// zeroClaudeBackoff removes the retry backoff sleep so the retry path runs without waiting.
func zeroClaudeBackoff(t *testing.T) {
	t.Helper()
	original := claudeRetryBackoffBase
	claudeRetryBackoffBase = 0
	t.Cleanup(func() { claudeRetryBackoffBase = original })
}

// fakeAnthropicServer mimics the Anthropic Messages API, returning responseText as a single content block.
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

// Returns the raw request body as a map so tests can assert which JSON keys are present or absent.
func captureRawAnthropicRequest(t *testing.T) map[string]interface{} {
	t.Helper()
	var body map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
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
	return body
}

func TestCallClaudeSendsThinkingDisabledForDefaultModel(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	t.Setenv("ANTHROPIC_MODEL", "")

	body := captureRawAnthropicRequest(t)

	thinking, ok := body["thinking"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected a thinking object for the default model, got %v", body["thinking"])
	}
	if thinking["type"] != "disabled" {
		t.Fatalf("expected thinking type disabled, got %v", thinking["type"])
	}
}

func TestCallClaudeOmitsThinkingForFableFamily(t *testing.T) {
	t.Setenv("ANTHROPIC_API_KEY", "test-key")
	t.Setenv("ANTHROPIC_MODEL", "claude-fable-5")

	body := captureRawAnthropicRequest(t)

	if _, present := body["thinking"]; present {
		t.Fatalf("expected the thinking field to be omitted for the fable family, got %v", body["thinking"])
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
		`{"a":1}`:                      `{"a":1}`,
		"```json\n{\"a\":1}\n```":      `{"a":1}`,
		"```\n{\"a\":1}\n```":          `{"a":1}`,
		"  {\"a\":1}  ":                `{"a":1}`,
		"Here is the JSON:\n{\"a\":1}": `{"a":1}`,
		"{\"a\":1}\nHope that helps!":  `{"a":1}`,
	}
	for input, want := range cases {
		if got := extractJSON(input); got != want {
			t.Errorf("extractJSON(%q) = %q, want %q", input, got, want)
		}
	}
}
