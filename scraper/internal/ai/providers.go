package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"sort"
	"strings"

	"jobtracker/scraper/internal/textutil"
)

// providerSpec holds one entry per tool, so setting AI_PROVIDER=gemini is all it takes to use Gemini.
type providerSpec struct {
	protocol protocol
	baseURL  string
	// Empty means AI_MODEL is required: model names change too often for a lasting default.
	defaultModel string
	// Runs on this machine, so it takes no key.
	local bool
	// Chat Completions tools disagree on max_tokens vs max_completion_tokens, and an unknown name is
	// refused or silently ignored. Anthropic's protocol always uses max_tokens.
	tokenLimitField string
}

var providers = map[string]providerSpec{
	"anthropic":  {protocol: anthropicMessages, baseURL: "https://api.anthropic.com", defaultModel: "claude-sonnet-5"},
	"openai":     {protocol: chatCompletions, baseURL: "https://api.openai.com/v1", tokenLimitField: "max_completion_tokens"},
	"gemini":     {protocol: chatCompletions, baseURL: "https://generativelanguage.googleapis.com/v1beta/openai", tokenLimitField: "max_completion_tokens"},
	"mistral":    {protocol: chatCompletions, baseURL: "https://api.mistral.ai/v1", tokenLimitField: "max_tokens"},
	"deepseek":   {protocol: chatCompletions, baseURL: "https://api.deepseek.com/v1", tokenLimitField: "max_tokens"},
	"groq":       {protocol: chatCompletions, baseURL: "https://api.groq.com/openai/v1", tokenLimitField: "max_tokens"},
	"xai":        {protocol: chatCompletions, baseURL: "https://api.x.ai/v1", tokenLimitField: "max_tokens"},
	"openrouter": {protocol: chatCompletions, baseURL: "https://openrouter.ai/api/v1", tokenLimitField: "max_tokens"},
	"ollama":     {protocol: chatCompletions, baseURL: "http://host.docker.internal:11434/v1", local: true, tokenLimitField: "max_tokens"},
	"lmstudio":   {protocol: chatCompletions, baseURL: "http://host.docker.internal:1234/v1", local: true, tokenLimitField: "max_tokens"},
}

// protocol is how a request travels on the wire. Most tools publish the same Chat Completions shape,
// so they share its code here, while each keeps its own entry above.
type protocol struct {
	path    string
	headers func(apiKey string) map[string]string
	request func(p provider, systemPrompt, userMessage string, maxTokens int) any
	answer  func(body []byte) (string, error)
	// Nil where the protocol has no web search of its own; research then answers from the model alone.
	search func(ctx context.Context, p provider, systemPrompt, userMessage string, maxTokens int) (string, []source, error)
}

var anthropicMessages = protocol{
	path: "/v1/messages",
	headers: func(apiKey string) map[string]string {
		return map[string]string{"x-api-key": apiKey, "anthropic-version": "2023-06-01"}
	},
	request: anthropicRequest,
	answer:  anthropicAnswer,
	search:  anthropicSearch,
}

var chatCompletions = protocol{
	path: "/chat/completions",
	headers: func(apiKey string) map[string]string {
		// A local server takes no key, and an empty bearer is refused by some of them.
		if apiKey == "" {
			return nil
		}
		return map[string]string{"Authorization": "Bearer " + apiKey}
	},
	request: chatCompletionsRequest,
	answer:  chatCompletionsAnswer,
}

type provider struct {
	spec    providerSpec
	baseURL string
	model   string
	apiKey  string
}

var errUnknownProvider = errors.New("unknown AI_PROVIDER")

// configuredProvider reads the AI_* settings. An install from before they existed set only
// ANTHROPIC_API_KEY and ANTHROPIC_MODEL, so those still count when the provider is Anthropic.
func configuredProvider() (provider, error) {
	name := strings.ToLower(os.Getenv("AI_PROVIDER"))
	if name == "" {
		name = "anthropic"
	}
	spec, known := providers[name]
	if !known {
		return provider{}, fmt.Errorf("%w %q: use one of %s", errUnknownProvider, name, strings.Join(providerNames(), ", "))
	}
	apiKey := firstSet(os.Getenv("AI_API_KEY"), legacy(name, "ANTHROPIC_API_KEY"))
	model := firstSet(os.Getenv("AI_MODEL"), legacy(name, "ANTHROPIC_MODEL"), spec.defaultModel)
	if model == "" || (apiKey == "" && !spec.local) {
		return provider{}, errNotConfigured
	}
	return provider{
		spec: spec,
		// Only to reach a tool somewhere other than its usual address, like Ollama on another machine.
		baseURL: strings.TrimRight(firstSet(os.Getenv("AI_BASE_URL"), spec.baseURL), "/"),
		model:   model,
		apiKey:  apiKey,
	}, nil
}

// ValidateConfig fails startup on a provider name that can't work, rather than every AI call later.
func ValidateConfig() error {
	_, err := configuredProvider()
	if errors.Is(err, errUnknownProvider) {
		return err
	}
	return nil
}

func providerNames() []string {
	names := make([]string, 0, len(providers))
	for name := range providers {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}

func legacy(provider, variable string) string {
	if provider != "anthropic" {
		return ""
	}
	return os.Getenv(variable)
}

func firstSet(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func anthropicRequest(p provider, systemPrompt, userMessage string, maxTokens int) any {
	type block struct {
		Type         string            `json:"type"`
		Text         string            `json:"text"`
		CacheControl map[string]string `json:"cache_control,omitempty"`
	}
	type message struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	return struct {
		Model     string            `json:"model"`
		MaxTokens int               `json:"max_tokens"`
		Thinking  map[string]string `json:"thinking,omitempty"`
		System    []block           `json:"system"`
		Messages  []message         `json:"messages"`
	}{
		Model:     p.model,
		MaxTokens: maxTokens,
		Thinking:  thinkingOff(p.model),
		// Fixed per call, so cacheable; a no-op until it passes the model's minimum cacheable length.
		System:   []block{{Type: "text", Text: systemPrompt, CacheControl: map[string]string{"type": "ephemeral"}}},
		Messages: []message{{Role: "user", Content: userMessage}},
	}
}

// Minimal thinking leaves the token budget to the JSON, but each Claude model spells it differently and a
// wrong one 400s every call. Fable, Mythos, and Opus 5.5 reject any field but adaptive, so it's omitted.
func thinkingOff(model string) map[string]string {
	m := strings.ToLower(model)
	switch {
	case strings.HasPrefix(m, "claude-fable"), strings.HasPrefix(m, "claude-mythos"), strings.HasPrefix(m, "claude-opus-5-5"):
		return nil
	case strings.HasPrefix(m, "claude-sonnet-5-5"):
		return map[string]string{"type": "between_tools"}
	default:
		return map[string]string{"type": "disabled"}
	}
}

func anthropicAnswer(body []byte) (string, error) {
	var parsed struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		StopReason string `json:"stop_reason"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("decode answer: %w", err)
	}
	var text strings.Builder
	for _, block := range parsed.Content {
		if block.Type == "text" {
			text.WriteString(block.Text)
		}
	}
	return nonEmpty(text.String(), parsed.StopReason, body)
}

func chatCompletionsRequest(p provider, systemPrompt, userMessage string, maxTokens int) any {
	return map[string]any{
		"model":                p.model,
		p.spec.tokenLimitField: maxTokens,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userMessage},
		},
	}
}

func chatCompletionsAnswer(body []byte) (string, error) {
	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
			FinishReason string `json:"finish_reason"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", fmt.Errorf("decode answer: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return nonEmpty("", "no choices", body)
	}
	return nonEmpty(parsed.Choices[0].Message.Content, parsed.Choices[0].FinishReason, body)
}

// An empty answer usually means the token budget ran out before any text; the stop reason says so.
func nonEmpty(text, stopReason string, body []byte) (string, error) {
	if text == "" {
		return "", fmt.Errorf("empty answer (stop reason %q): %s", stopReason, textutil.Truncate(string(body), 2000))
	}
	return text, nil
}
