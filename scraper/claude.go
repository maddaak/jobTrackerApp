package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

// anthropicBaseURL is a package var (not a const) so tests can point it at a local
// httptest.Server instead of the real Anthropic API.
var anthropicBaseURL = "https://api.anthropic.com"

var claudeHTTPClient = &http.Client{Timeout: 30 * time.Second}

var errNotConfigured = errors.New("anthropic api key not configured")

const maxPromptChars = 12000
const defaultAnthropicModel = "claude-sonnet-5"

type anthropicMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type cacheControl struct {
	Type string `json:"type"`
}

// System prompts here are fixed strings (resumeAnalysisSystemPrompt/matchResumeSystemPrompt)
// reused on every call, so marking them cacheable lets Anthropic skip reprocessing the same
// prompt tokens on repeat requests — cheaper and faster than sending it as a plain string.
type anthropicSystemBlock struct {
	Type         string        `json:"type"`
	Text         string        `json:"text"`
	CacheControl *cacheControl `json:"cache_control,omitempty"`
}

type anthropicRequest struct {
	Model     string                 `json:"model"`
	MaxTokens int                    `json:"max_tokens"`
	System    []anthropicSystemBlock `json:"system"`
	Messages  []anthropicMessage     `json:"messages"`
}

type anthropicContentBlock struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type anthropicResponse struct {
	Content []anthropicContentBlock `json:"content"`
}

// callClaude sends one single-turn message to Claude and returns its text response.
// Returns errNotConfigured (no API key set — nothing to retry) or a wrapped transient
// error (network/API failure — worth retrying) so callers can tell the two apart.
func callClaude(systemPrompt, userMessage string) (string, error) {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	if apiKey == "" {
		return "", errNotConfigured
	}
	model := os.Getenv("ANTHROPIC_MODEL")
	if model == "" {
		model = defaultAnthropicModel
	}

	reqBody, err := json.Marshal(anthropicRequest{
		Model:     model,
		MaxTokens: 1024,
		System: []anthropicSystemBlock{
			{Type: "text", Text: systemPrompt, CacheControl: &cacheControl{Type: "ephemeral"}},
		},
		Messages: []anthropicMessage{{Role: "user", Content: userMessage}},
	})
	if err != nil {
		return "", fmt.Errorf("marshal anthropic request: %w", err)
	}

	httpReq, err := http.NewRequest(http.MethodPost, anthropicBaseURL+"/v1/messages", bytes.NewReader(reqBody))
	if err != nil {
		return "", fmt.Errorf("build anthropic request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := claudeHTTPClient.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("call anthropic: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("anthropic returned status %d: %s", resp.StatusCode, string(body))
	}

	var parsed anthropicResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", fmt.Errorf("decode anthropic response: %w", err)
	}

	var text strings.Builder
	for _, block := range parsed.Content {
		if block.Type == "text" {
			text.WriteString(block.Text)
		}
	}
	if text.Len() == 0 {
		return "", fmt.Errorf("empty response from anthropic")
	}
	return text.String(), nil
}

// stripJSONFence removes a ```json ... ``` (or plain ``` ... ```) wrapper some models add
// around JSON output despite being told not to.
func stripJSONFence(s string) string {
	s = strings.TrimSpace(s)
	if !strings.HasPrefix(s, "```") {
		return s
	}
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	return strings.TrimSpace(s)
}

// writeClaudeError maps a callClaude error to the two-status contract every AI endpoint
// shares: 503 when there's no key to retry with, 502 for anything transient.
func writeClaudeError(w http.ResponseWriter, err error) {
	if errors.Is(err, errNotConfigured) {
		writeError(w, http.StatusServiceUnavailable, "not_configured")
		return
	}
	log.Printf("claude call failed: %v", err)
	writeError(w, http.StatusBadGateway, "unavailable")
}

type resumeAnalysis struct {
	Summary   string   `json:"summary"`
	Skills    []string `json:"skills"`
	Seniority string   `json:"seniority"`
	Roles     []string `json:"roles"`
}

type analyzeResumeRequest struct {
	Text string `json:"text"`
}

const resumeAnalysisSystemPrompt = `You are a resume analyst. Given a resume's text, respond ` +
	`with ONLY valid JSON (no markdown fences, no commentary) matching exactly this schema: ` +
	`{"summary": "2-3 sentence summary of the candidate", "skills": ["skill1", "skill2", ...], ` +
	`"seniority": "junior|mid|senior|staff|principal", "roles": ["job titles/domains this ` +
	`resume targets", ...]}`

func analyzeResumeHandler(w http.ResponseWriter, r *http.Request) {
	var req analyzeResumeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || strings.TrimSpace(req.Text) == "" {
		writeError(w, http.StatusBadRequest, "text is required")
		return
	}

	raw, err := callClaude(resumeAnalysisSystemPrompt, truncate(req.Text, maxPromptChars))
	if err != nil {
		writeClaudeError(w, err)
		return
	}

	var analysis resumeAnalysis
	if err := json.Unmarshal([]byte(stripJSONFence(raw)), &analysis); err != nil {
		writeError(w, http.StatusBadGateway, "unavailable")
		return
	}

	writeJSON(w, http.StatusOK, analysis)
}

type resumeSummary struct {
	ID        string   `json:"id"`
	FileName  string   `json:"fileName"`
	Summary   string   `json:"summary"`
	Skills    []string `json:"skills"`
	Seniority string   `json:"seniority"`
	Roles     []string `json:"roles"`
}

type matchResumeRequest struct {
	JobDescriptionText string          `json:"jobDescriptionText"`
	Resumes            []resumeSummary `json:"resumes"`
}

type matchResult struct {
	BestResumeID   string `json:"bestResumeId"`
	Recommendation string `json:"recommendation"`
	Reasoning      string `json:"reasoning"`
}

const matchResumeSystemPrompt = `You are a job-fit analyst. Given a job description and a ` +
	`list of candidate resumes (each with a cached summary/skills/seniority/roles), pick the ` +
	`single best-fit resume and judge whether the candidate should actually apply given their ` +
	`background — this is a genuine fit judgment, not just picking the least-bad option. ` +
	`Respond with ONLY valid JSON (no markdown fences, no commentary) matching exactly this ` +
	`schema: {"bestResumeId": "<id from the resumes list>", "recommendation": "APPLY" or ` +
	`"DO_NOT_APPLY", "reasoning": "1-2 sentence explanation"}`

func matchResumeHandler(w http.ResponseWriter, r *http.Request) {
	var req matchResumeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil ||
		strings.TrimSpace(req.JobDescriptionText) == "" || len(req.Resumes) == 0 {
		writeError(w, http.StatusBadRequest, "jobDescriptionText and at least one resume are required")
		return
	}

	resumesJSON, err := json.Marshal(req.Resumes)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid resumes")
		return
	}
	userMessage := fmt.Sprintf("Job description:\n%s\n\nCandidate resumes (JSON):\n%s",
		truncate(req.JobDescriptionText, maxPromptChars), string(resumesJSON))

	raw, err := callClaude(matchResumeSystemPrompt, userMessage)
	if err != nil {
		writeClaudeError(w, err)
		return
	}

	var result matchResult
	if err := json.Unmarshal([]byte(stripJSONFence(raw)), &result); err != nil {
		writeError(w, http.StatusBadGateway, "unavailable")
		return
	}

	writeJSON(w, http.StatusOK, result)
}
