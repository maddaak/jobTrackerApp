package ai

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func zeroBackoff(t *testing.T) {
	t.Helper()
	original := retryBackoffBase
	retryBackoffBase = 0
	t.Cleanup(func() { retryBackoffBase = original })
}

func answerIn(name, text string) any {
	if providers[name].protocol.path == chatCompletions.path {
		return map[string]any{"choices": []map[string]any{{"message": map[string]string{"content": text}}}}
	}
	return map[string]any{"content": []map[string]string{{"type": "text", "text": text}}}
}

func useFakeProvider(t *testing.T, name, reply string) *[]map[string]any {
	t.Helper()
	var requests []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		body["path"] = r.URL.Path
		body["authorization"] = r.Header.Get("Authorization")
		body["x-api-key"] = r.Header.Get("x-api-key")
		requests = append(requests, body)
		_ = json.NewEncoder(w).Encode(answerIn(name, reply))
	}))
	t.Cleanup(server.Close)
	t.Setenv("AI_PROVIDER", name)
	t.Setenv("AI_BASE_URL", server.URL)
	t.Setenv("AI_API_KEY", "test-key")
	t.Setenv("AI_MODEL", "test-model")
	return &requests
}

// The feature tests run on the Anthropic format; what differs between formats is tested below.
func fakeAnthropicServer(t *testing.T, reply string) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewEncoder(w).Encode(answerIn("anthropic", reply))
	}))
	t.Cleanup(server.Close)
	return server
}

func withAnthropicBaseURL(t *testing.T, url string) {
	t.Helper()
	t.Setenv("AI_BASE_URL", url)
}

// Every tool in the table, so one added later is covered without touching these tests.
func TestEveryToolRoundTripsThroughTheOneCallWithItsOwnDetails(t *testing.T) {
	for _, name := range providerNames() {
		spec := providers[name]
		requests := useFakeProvider(t, name, `{"hello":"world"}`)

		text, err := complete(context.Background(), "system", "user", 1024)

		if err != nil || text != `{"hello":"world"}` {
			t.Errorf("%s: got %q, %v", name, text, err)
			continue
		}
		sent := (*requests)[0]
		if sent["path"] != spec.protocol.path {
			t.Errorf("%s: sent to %v, want %s", name, sent["path"], spec.protocol.path)
		}
		if spec.protocol.path != chatCompletions.path {
			continue
		}
		// Only this tool's spelling of the cap: the other one is unknown to it.
		for _, field := range []string{"max_tokens", "max_completion_tokens"} {
			if got, want := sent[field] != nil, field == spec.tokenLimitField; got != want {
				t.Errorf("%s: %s sent=%v, want sent=%v", name, field, got, want)
			}
		}
		if sent["authorization"] != "Bearer test-key" {
			t.Errorf("%s: expected the key as a bearer token, got %q", name, sent["authorization"])
		}
	}
}

func TestEveryToolKnowsWhereItLivesAndHowItCapsReplies(t *testing.T) {
	for _, name := range providerNames() {
		spec := providers[name]
		if spec.baseURL == "" {
			t.Errorf("%s has no address", name)
		}
		if spec.protocol.path == chatCompletions.path && spec.tokenLimitField == "" {
			t.Errorf("%s has no reply cap field", name)
		}
		// A local tool runs on the host, which the scraper container reaches by this name.
		if spec.local && !strings.Contains(spec.baseURL, "host.docker.internal") {
			t.Errorf("%s is local but points at %s", name, spec.baseURL)
		}
	}
}

func TestAnthropicRequestKeepsItsOwnShape(t *testing.T) {
	requests := useFakeProvider(t, "anthropic", "ok")

	if _, err := complete(context.Background(), "system prompt", "user", 1024); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	sent := (*requests)[0]
	system := sent["system"].([]any)[0].(map[string]any)
	if sent["path"] != "/v1/messages" || sent["x-api-key"] != "test-key" || sent["max_tokens"] != float64(1024) {
		t.Errorf("unexpected request: %v", sent)
	}
	if system["text"] != "system prompt" || system["cache_control"].(map[string]any)["type"] != "ephemeral" {
		t.Errorf("expected a cacheable system block, got %v", system)
	}
}

func TestChatCompletionsRequestSendsTheSystemPromptAsAMessage(t *testing.T) {
	requests := useFakeProvider(t, "openai", "ok")

	if _, err := complete(context.Background(), "system prompt", "user", 1024); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	sent := (*requests)[0]
	messages := sent["messages"].([]any)
	// OpenAI's reasoning models refuse max_tokens outright.
	if sent["model"] != "test-model" || sent["max_completion_tokens"] != float64(1024) {
		t.Errorf("unexpected request: %v", sent)
	}
	if messages[0].(map[string]any)["role"] != "system" || messages[0].(map[string]any)["content"] != "system prompt" {
		t.Errorf("expected the system prompt first, got %v", messages)
	}
}

// A local server needs no key, and an empty bearer header is refused by some of them.
func TestALocalToolIsUsableWithoutAKey(t *testing.T) {
	requests := useFakeProvider(t, "ollama", "ok")
	t.Setenv("AI_API_KEY", "")

	if _, err := complete(context.Background(), "system", "user", 1024); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if (*requests)[0]["authorization"] != "" {
		t.Errorf("expected no Authorization header, got %q", (*requests)[0]["authorization"])
	}
}

func TestConfiguredProviderNeedsWhatEachSetupNeeds(t *testing.T) {
	for _, tc := range []struct {
		name string
		env  map[string]string
		ok   bool
	}{
		{"nothing set", map[string]string{}, false},
		{"an install from before AI_* existed", map[string]string{"ANTHROPIC_API_KEY": "k"}, true},
		{"anthropic with the new names", map[string]string{"AI_API_KEY": "k"}, true},
		{"an Anthropic key is never sent to another tool", map[string]string{"AI_PROVIDER": "gemini", "ANTHROPIC_API_KEY": "k", "AI_MODEL": "m"}, false},
		{"a hosted tool with no model", map[string]string{"AI_PROVIDER": "gemini", "AI_API_KEY": "k"}, false},
		{"a hosted tool with no key", map[string]string{"AI_PROVIDER": "mistral", "AI_MODEL": "m"}, false},
		{"a hosted tool", map[string]string{"AI_PROVIDER": "gemini", "AI_API_KEY": "k", "AI_MODEL": "m"}, true},
		{"a local tool needs no key", map[string]string{"AI_PROVIDER": "ollama", "AI_MODEL": "m"}, true},
		{"names are not case sensitive", map[string]string{"AI_PROVIDER": "LMStudio", "AI_MODEL": "m"}, true},
		{"an unknown provider", map[string]string{"AI_PROVIDER": "nonsense", "AI_API_KEY": "k"}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			for _, name := range []string{"AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_BASE_URL", "ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"} {
				t.Setenv(name, tc.env[name])
			}
			if _, err := configuredProvider(); (err == nil) != tc.ok {
				t.Errorf("expected usable=%v, got %v", tc.ok, err)
			}
		})
	}
}

func TestStartupRefusesAnUnknownProviderButNotAMissingKey(t *testing.T) {
	t.Setenv("AI_PROVIDER", "nonsense")
	if err := ValidateConfig(); !errors.Is(err, errUnknownProvider) {
		t.Errorf("expected errUnknownProvider, got %v", err)
	}
	t.Setenv("AI_PROVIDER", "")
	t.Setenv("AI_API_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	if err := ValidateConfig(); err != nil {
		t.Errorf("no key leaves AI off, it doesn't stop the scraper: %v", err)
	}
}

// Each Claude model spells "think as little as possible" differently, and a wrong spelling 400s every call.
// "" means the thinking field must be omitted.
func TestAnthropicSendsTheThinkingOffEachModelAccepts(t *testing.T) {
	for model, want := range map[string]string{
		"claude-sonnet-5":   "disabled",
		"claude-opus-4-8":   "disabled",
		"claude-sonnet-5-5": "between_tools",
		"claude-opus-5-5":   "",
		"claude-fable-5":    "",
		"claude-fable-5-1":  "",
		"claude-mythos-5-1": "",
	} {
		t.Run(model, func(t *testing.T) {
			requests := useFakeProvider(t, "anthropic", "ok")
			t.Setenv("AI_MODEL", model)

			if _, err := complete(context.Background(), "system", "user", 1024); err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			thinking, sent := (*requests)[0]["thinking"].(map[string]any)
			if want == "" && sent {
				t.Fatalf("expected no thinking field, got %v", thinking)
			}
			if want != "" && (!sent || thinking["type"] != want) {
				t.Fatalf("expected thinking type %q, got %v", want, thinking)
			}
		})
	}
}

// Each retry is a chance to pay again, so only a request the provider turned away unworked is retried.
// A 500 or a gateway error can come back after the model has run, so it's asked once.
func TestEveryToolRetriesOnlyARequestTheProviderTurnedAway(t *testing.T) {
	zeroBackoff(t)
	for _, name := range providerNames() {
		for status, wantAttempts := range map[int]int32{
			http.StatusTooManyRequests:     maxRetries + 1,
			http.StatusServiceUnavailable:  maxRetries + 1,
			529:                            maxRetries + 1, // Anthropic: overloaded
			http.StatusInternalServerError: 1,
			http.StatusBadGateway:          1,
			http.StatusGatewayTimeout:      1,
			http.StatusBadRequest:          1,
		} {
			var hits atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				hits.Add(1)
				w.WriteHeader(status)
			}))
			useFakeProvider(t, name, "")
			t.Setenv("AI_BASE_URL", server.URL)

			_, err := complete(context.Background(), "system", "user", 1024)
			server.Close()

			if err == nil || hits.Load() != wantAttempts {
				t.Errorf("%s, status %d: expected an error after %d attempts, got %v after %d",
					name, status, wantAttempts, err, hits.Load())
			}
		}
	}
}

// Go would resend the key to the redirect's target, so a base URL that redirects must not be followed.
func TestEveryToolRefusesToFollowARedirectWithTheKey(t *testing.T) {
	for _, name := range providerNames() {
		var leaked atomic.Bool
		elsewhere := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			leaked.Store(r.Header.Get("x-api-key") != "" || r.Header.Get("Authorization") != "")
		}))
		redirecting := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			http.Redirect(w, r, elsewhere.URL+r.URL.Path, http.StatusTemporaryRedirect)
		}))
		useFakeProvider(t, name, "")
		t.Setenv("AI_BASE_URL", redirecting.URL)

		_, err := complete(context.Background(), "system", "user", 1024)
		redirecting.Close()
		elsewhere.Close()

		if err == nil || leaked.Load() {
			t.Errorf("%s: expected an error and no request elsewhere, got %v (key sent elsewhere: %v)", name, err, leaked.Load())
		}
	}
}

// A provider's error page can run to megabytes; the log gets the start of it.
func TestAProviderErrorIsCutShortForTheLog(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(strings.Repeat("x", 100_000)))
	}))
	t.Cleanup(server.Close)
	useFakeProvider(t, "anthropic", "")
	t.Setenv("AI_BASE_URL", server.URL)

	_, err := complete(context.Background(), "system", "user", 1024)

	if err == nil || len(err.Error()) > 2200 {
		t.Errorf("expected an error of at most ~2000 characters, got %d", len(err.Error()))
	}
}

func withCallBudget(t *testing.T, budget time.Duration) {
	t.Helper()
	original := callBudget
	callBudget = budget
	t.Cleanup(func() { callBudget = original })
}

func TestATimeoutIsNotRetriedSinceTheCallMayAlreadyBeBilled(t *testing.T) {
	zeroBackoff(t)
	withCallBudget(t, 50*time.Millisecond)
	var hits atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		time.Sleep(200 * time.Millisecond)
	}))
	defer server.Close()
	useFakeProvider(t, "anthropic", "")
	t.Setenv("AI_BASE_URL", server.URL)

	_, err := complete(context.Background(), "system", "user", 1024)

	if err == nil || hits.Load() != 1 {
		t.Fatalf("expected one attempt and an error, got %d and %v", hits.Load(), err)
	}
}

// Retries share one budget: slow refusals can't stack into minutes while the person waits for an answer.
func TestEveryAttemptTogetherStaysInsideOneTimeBudget(t *testing.T) {
	retryBackoffBase = 20 * time.Millisecond
	t.Cleanup(func() { retryBackoffBase = 500 * time.Millisecond })
	withCallBudget(t, 150*time.Millisecond)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(80 * time.Millisecond)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	useFakeProvider(t, "anthropic", "")
	t.Setenv("AI_BASE_URL", server.URL)

	started := time.Now()
	_, err := complete(context.Background(), "system", "user", 1024)

	// Three slow refusals plus backoff would take about 300ms without the budget.
	if err == nil || time.Since(started) > 250*time.Millisecond {
		t.Fatalf("expected an error within the budget, got %v after %v", err, time.Since(started))
	}
}

func TestAConnectionThatNeverOpenedIsRetried(t *testing.T) {
	zeroBackoff(t)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {}))
	closedAddress := server.URL
	server.Close()
	useFakeProvider(t, "anthropic", "")
	t.Setenv("AI_BASE_URL", closedAddress)

	p, err := configuredProvider()
	if err != nil {
		t.Fatal(err)
	}
	_, retryable, err := sendOnce(context.Background(), p, []byte("{}"))

	if err == nil || !retryable {
		t.Fatalf("expected a refused connection to be retryable, got retryable=%v err=%v", retryable, err)
	}
}

func TestAnEmptyAnswerIsAnErrorForEveryTool(t *testing.T) {
	for _, name := range providerNames() {
		useFakeProvider(t, name, "")
		if _, err := complete(context.Background(), "system", "user", 1024); err == nil {
			t.Errorf("%s: expected an error for an empty answer", name)
		}
	}
}

func TestAskFindsTheObjectWhateverSurroundsIt(t *testing.T) {
	for _, reply := range []string{
		`{"a":1}`,
		"```json\n{\"a\":1}\n```",
		"```\n{\"a\":1}\n```",
		"  {\"a\":1}  ",
		"Here is the JSON:\n{\"a\":1}",
		"{\"a\":1}\nHope that helps!",
		"{\"a\":1}\nNote: fields like {a} are integers.",
	} {
		useFakeProvider(t, "openai", reply)
		var out struct{ A int }
		if _, err := ask(context.Background(), "test", "system", "user", 1024, &out); err != nil || out.A != 1 {
			t.Errorf("reply %q: got %+v, err %v; want a=1", reply, out, err)
		}
	}
}

func TestAskReportsABadResponseWhenThereIsNoObject(t *testing.T) {
	useFakeProvider(t, "anthropic", "I can't help with that.")

	var out struct{ A int }
	_, err := ask(context.Background(), "test", "system", "user", 1024, &out)

	if !errors.Is(err, errBadResponse) {
		t.Fatalf("expected errBadResponse, got %v", err)
	}
}

func TestNoProviderMeansNotConfigured(t *testing.T) {
	for _, name := range []string{"AI_PROVIDER", "AI_API_KEY", "AI_MODEL", "AI_BASE_URL", "ANTHROPIC_API_KEY"} {
		t.Setenv(name, "")
	}
	if _, err := complete(context.Background(), "system", "user", 1024); !errors.Is(err, errNotConfigured) {
		t.Fatalf("expected errNotConfigured, got %v", err)
	}
}
