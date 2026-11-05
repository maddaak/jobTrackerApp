package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"jobtracker/scraper/internal/textutil"
)

type source struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

// Each search is billed on its own ($10 per 1,000 on Anthropic), so a check is capped at a handful.
const maxSearches = 4

// A long search turn can pause; resuming sends it back unchanged. Bounded so a stuck turn can't loop.
const maxContinuations = 3

const maxSources = 8

// research answers from live web sources where the provider can search, and from the model alone where it
// can't. searched tells the caller which, so the result can say whether it cites anything.
func research(ctx context.Context, systemPrompt, userMessage string, maxTokens int) (text string, sources []source, searched bool, err error) {
	p, err := configuredProvider()
	if err != nil {
		return "", nil, false, err
	}
	if p.spec.protocol.search == nil {
		text, err = complete(ctx, systemPrompt, userMessage, maxTokens)
		return text, nil, false, err
	}
	ctx, cancel := context.WithTimeout(ctx, callBudget)
	defer cancel()
	text, sources, err = p.spec.protocol.search(ctx, p, systemPrompt, userMessage, maxTokens)
	return text, sources, true, err
}

// Dynamic filtering (the 20260209 tool) keeps raw results out of the context, cutting tokens, but only
// newer models accept it; older ones take the basic tool.
func webSearchTool(model string) string {
	m := strings.ToLower(model)
	for _, prefix := range []string{"claude-opus-5", "claude-sonnet-5", "claude-fable", "claude-mythos",
		"claude-opus-4-6", "claude-opus-4-7", "claude-opus-4-8", "claude-sonnet-4-6"} {
		if strings.HasPrefix(m, prefix) {
			return "web_search_20260209"
		}
	}
	return "web_search_20250305"
}

func anthropicSearch(ctx context.Context, p provider, systemPrompt, userMessage string, maxTokens int) (string, []source, error) {
	type block struct {
		Type         string            `json:"type"`
		Text         string            `json:"text"`
		CacheControl map[string]string `json:"cache_control,omitempty"`
	}
	messages := []any{map[string]string{"role": "user", "content": userMessage}}
	for turn := 0; turn <= maxContinuations; turn++ {
		respBody, err := post(ctx, p, struct {
			Model     string            `json:"model"`
			MaxTokens int               `json:"max_tokens"`
			Thinking  map[string]string `json:"thinking,omitempty"`
			System    []block           `json:"system"`
			Messages  []any             `json:"messages"`
			Tools     []map[string]any  `json:"tools"`
		}{
			Model:     p.model,
			MaxTokens: maxTokens,
			Thinking:  thinkingOff(p.model),
			System:    []block{{Type: "text", Text: systemPrompt, CacheControl: map[string]string{"type": "ephemeral"}}},
			Messages:  messages,
			Tools:     []map[string]any{{"type": webSearchTool(p.model), "name": "web_search", "max_uses": maxSearches}},
		})
		if err != nil {
			return "", nil, err
		}
		var parsed struct {
			Content    []json.RawMessage `json:"content"`
			StopReason string            `json:"stop_reason"`
		}
		if err := json.Unmarshal(respBody, &parsed); err != nil {
			return "", nil, fmt.Errorf("decode answer: %w", err)
		}
		if parsed.StopReason == "pause_turn" {
			// Sent back exactly as received: the API needs the encrypted search content to resume.
			messages = append(messages, map[string]any{"role": "assistant", "content": parsed.Content})
			continue
		}
		text, sources := textAndSources(parsed.Content)
		text, err = nonEmpty(text, parsed.StopReason, respBody)
		return text, sources, err
	}
	return "", nil, fmt.Errorf("search still running after %d continuations", maxContinuations)
}

// The answer's text arrives split across blocks wherever a citation starts, so it's joined back up, and
// the citations become the sources the result shows.
func textAndSources(content []json.RawMessage) (string, []source) {
	var text strings.Builder
	var sources []source
	seen := map[string]bool{}
	for _, raw := range content {
		var b struct {
			Type      string `json:"type"`
			Text      string `json:"text"`
			Citations []struct {
				Type  string `json:"type"`
				URL   string `json:"url"`
				Title string `json:"title"`
			} `json:"citations"`
		}
		if json.Unmarshal(raw, &b) != nil || b.Type != "text" {
			continue
		}
		text.WriteString(b.Text)
		for _, c := range b.Citations {
			// Within core's limits on a saved source (255 and 2048 characters), so one long page title can't
			// get the whole answer refused.
			if c.Type == "web_search_result_location" && c.URL != "" && len(c.URL) <= 2048 && !seen[c.URL] && len(sources) < maxSources {
				seen[c.URL] = true
				sources = append(sources, source{Title: textutil.Truncate(c.Title, 255), URL: c.URL})
			}
		}
	}
	return text.String(), sources
}
