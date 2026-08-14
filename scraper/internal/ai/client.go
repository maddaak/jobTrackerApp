// Package ai wraps the Anthropic Messages API and the resume features built on it.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"jobtracker/scraper/internal/httpx"
	"jobtracker/scraper/internal/textutil"
)

// anthropicBaseURL is a package var so tests can point it at a local server.
var anthropicBaseURL = "https://api.anthropic.com"

var claudeHTTPClient = &http.Client{Timeout: 30 * time.Second}

var errNotConfigured = errors.New("anthropic api key not configured")

// errBadResponse marks a call that succeeded but came back unusable, so the caller answers 502 rather than 503.
var errBadResponse = errors.New("unusable response from claude")

var errInvalidVariants = errors.New("invalid variants")

const maxPromptChars = 12000
const defaultAnthropicModel = "claude-sonnet-5"

// Retries beyond the first attempt for transient Anthropic failures.
const claudeMaxRetries = 2

var claudeRetryBackoffBase = 500 * time.Millisecond

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type cacheControl struct {
	Type string `json:"type"`
}

// System prompts are fixed per call, so mark them cacheable; a no-op until they exceed the model's min cacheable prefix.
type anthropicSystemBlock struct {
	Type         string        `json:"type"`
	Text         string        `json:"text"`
	CacheControl *cacheControl `json:"cache_control,omitempty"`
}

// anthropicThinking disables adaptive thinking so the token budget goes to the JSON answer, not reasoning.
type anthropicThinking struct {
	Type string `json:"type"`
}

type anthropicRequest struct {
	Model     string                 `json:"model"`
	MaxTokens int                    `json:"max_tokens"`
	Thinking  *anthropicThinking     `json:"thinking,omitempty"`
	System    []anthropicSystemBlock `json:"system"`
	Messages  []anthropicMessage     `json:"messages"`
}

type anthropicContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type anthropicResponse struct {
	Content    []anthropicContentBlock `json:"content"`
	StopReason string                  `json:"stop_reason"`
}

// callClaude sends one single-turn message and returns Claude's text; errNotConfigured (no key) vs a transient error retried up to claudeMaxRetries with backoff.
func callClaude(ctx context.Context, systemPrompt, userMessage string, maxTokens int) (string, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return "", errNotConfigured
	}
	model := os.Getenv("ANTHROPIC_MODEL")
	if model == "" {
		model = defaultAnthropicModel
	}

	// Fable/Mythos always think and 400 on an explicit thinking field, so omit it for them.
	lowerModel := strings.ToLower(model)
	var thinking *anthropicThinking
	if !strings.HasPrefix(lowerModel, "claude-fable") && !strings.HasPrefix(lowerModel, "claude-mythos") {
		thinking = &anthropicThinking{Type: "disabled"}
	}

	reqBody, err := json.Marshal(anthropicRequest{
		Model:     model,
		MaxTokens: maxTokens,
		Thinking:  thinking,
		System: []anthropicSystemBlock{
			{Type: "text", Text: systemPrompt, CacheControl: &cacheControl{Type: "ephemeral"}},
		},
		Messages: []anthropicMessage{{Role: "user", Content: userMessage}},
	})
	if err != nil {
		return "", fmt.Errorf("marshal anthropic request: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt <= claudeMaxRetries; attempt++ {
		if attempt > 0 {
			// Bail out if the caller disconnects mid-backoff instead of sleeping the full delay.
			select {
			case <-time.After(time.Duration(attempt) * claudeRetryBackoffBase):
			case <-ctx.Done():
				return "", ctx.Err()
			}
		}
		text, retryable, err := doClaudeRequest(ctx, apiKey, reqBody)
		if err == nil {
			return text, nil
		}
		lastErr = err
		if !retryable {
			return "", err
		}
	}
	return "", lastErr
}

// doClaudeRequest makes one attempt; the bool reports whether the failure is transient (network or 429/5xx).
func doClaudeRequest(ctx context.Context, apiKey string, reqBody []byte) (string, bool, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, anthropicBaseURL+"/v1/messages", bytes.NewReader(reqBody))
	if err != nil {
		return "", false, fmt.Errorf("build anthropic request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := claudeHTTPClient.Do(httpReq)
	if err != nil {
		return "", true, fmt.Errorf("call anthropic: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, httpx.MaxBodyBytes))
		retryable := resp.StatusCode == http.StatusTooManyRequests || resp.StatusCode >= 500
		return "", retryable, fmt.Errorf("anthropic returned status %d: %s", resp.StatusCode, string(body))
	}

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, httpx.MaxBodyBytes))
	if err != nil {
		return "", true, fmt.Errorf("read anthropic response: %w", err)
	}

	var parsed anthropicResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return "", false, fmt.Errorf("decode anthropic response: %w", err)
	}

	var text strings.Builder
	for _, block := range parsed.Content {
		if block.Type == "text" {
			text.WriteString(block.Text)
		}
	}
	if text.Len() == 0 {
		return "", false, fmt.Errorf("empty response from anthropic (stop_reason=%s): %s",
			parsed.StopReason, textutil.Truncate(string(respBody), 2000))
	}
	return text.String(), false, nil
}

// extractJSON strips a code fence and slices first { to last } so a prose preamble doesn't fail the parse.
func extractJSON(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	start := strings.Index(s, "{")
	end := strings.LastIndex(s, "}")
	if start >= 0 && end > start {
		return s[start : end+1]
	}
	return strings.TrimSpace(s)
}
