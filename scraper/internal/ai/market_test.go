package ai

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const marketAnswer = `{"verdict":"below","typicalLow":180000,"typicalHigh":220000,` +
	`"summary":"Surveys put this role higher.","negotiationPoints":["Ask for a higher base."]}`

// A search turn as the Messages API returns it: the search itself, then the answer split at each citation.
func searchedReply(stopReason string) map[string]any {
	cite := func(url string) []map[string]string {
		return []map[string]string{{"type": "web_search_result_location", "url": url, "title": "Pay data", "cited_text": "..."}}
	}
	return map[string]any{
		"stop_reason": stopReason,
		"content": []map[string]any{
			{"type": "server_tool_use", "id": "srvtoolu_1", "name": "web_search", "input": map[string]string{"query": "pay"}},
			{"type": "web_search_tool_result", "tool_use_id": "srvtoolu_1", "content": []map[string]string{
				{"type": "web_search_result", "url": "https://pay.example/a", "title": "Pay data", "encrypted_content": "abc"},
			}},
			{"type": "text", "text": "Typical pay is higher ", "citations": cite("https://pay.example/a")},
			{"type": "text", "text": "than this offer. ", "citations": cite("https://pay.example/a")},
			{"type": "text", "text": marketAnswer},
		},
	}
}

// Answers each request with the next reply in turn and records what was asked.
func scriptedServer(t *testing.T, replies ...map[string]any) *[]map[string]any {
	t.Helper()
	var requests []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		requests = append(requests, body)
		_ = json.NewEncoder(w).Encode(replies[min(len(requests), len(replies))-1])
	}))
	t.Cleanup(server.Close)
	useFakeProvider(t, "anthropic", "")
	t.Setenv("AI_MODEL", "claude-sonnet-5")
	t.Setenv("AI_BASE_URL", server.URL)
	return &requests
}

const offerBody = `{"company":"Initech","role":"Backend Engineer","location":"REMOTE","baseSalary":150000}`

func TestMarketCheckSearchesTheWebAndCitesWhatItFound(t *testing.T) {
	requests := scriptedServer(t, searchedReply("end_turn"))

	w := doPost(t, MarketCheckHandler, offerBody)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	var result marketCheckResult
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if result.Verdict != "below" || !result.Searched || *result.TypicalLow != 180000 {
		t.Errorf("unexpected result: %+v", result)
	}
	// Cited twice, listed once.
	if len(result.Sources) != 1 || result.Sources[0].URL != "https://pay.example/a" {
		t.Errorf("expected one deduplicated source, got %+v", result.Sources)
	}
	tool := (*requests)[0]["tools"].([]any)[0].(map[string]any)
	if tool["type"] != "web_search_20260209" || tool["max_uses"] != float64(maxSearches) {
		t.Errorf("expected the capped web search tool, got %v", tool)
	}
}

// Resuming means sending the paused turn back unchanged; the encrypted results are what let it continue.
func TestMarketCheckResumesAPausedSearch(t *testing.T) {
	paused := searchedReply("pause_turn")
	requests := scriptedServer(t, paused, searchedReply("end_turn"))

	w := doPost(t, MarketCheckHandler, offerBody)

	if w.Code != http.StatusOK || len(*requests) != 2 {
		t.Fatalf("expected one resume then 200, got %d requests and %d", len(*requests), w.Code)
	}
	messages := (*requests)[1]["messages"].([]any)
	resumed := messages[1].(map[string]any)
	if resumed["role"] != "assistant" || len(resumed["content"].([]any)) != len(paused["content"].([]map[string]any)) {
		t.Errorf("expected the paused turn sent back whole, got %v", resumed)
	}
	if !strings.Contains(string(mustJSON(t, resumed)), `"encrypted_content":"abc"`) {
		t.Error("expected the encrypted search results to be sent back")
	}
}

func TestMarketCheckGivesUpOnASearchThatNeverFinishes(t *testing.T) {
	requests := scriptedServer(t, searchedReply("pause_turn"))

	w := doPost(t, MarketCheckHandler, offerBody)

	if w.Code != http.StatusBadGateway || len(*requests) != maxContinuations+1 {
		t.Fatalf("expected 502 after %d requests, got %d after %d", maxContinuations+1, w.Code, len(*requests))
	}
}

// A tool with no web search still answers, but as a labelled estimate with nothing to cite.
func TestMarketCheckEstimatesWhereTheToolCannotSearch(t *testing.T) {
	requests := useFakeProvider(t, "ollama", marketAnswer)

	w := doPost(t, MarketCheckHandler, offerBody)

	var result marketCheckResult
	_ = json.Unmarshal(w.Body.Bytes(), &result)
	if w.Code != http.StatusOK || result.Searched || len(result.Sources) != 0 {
		t.Fatalf("expected an unsearched estimate, got %d %+v", w.Code, result)
	}
	sent := (*requests)[0]
	if sent["tools"] != nil {
		t.Errorf("expected no tools for a tool that can't search, got %v", sent["tools"])
	}
	system := sent["messages"].([]any)[0].(map[string]any)["content"].(string)
	if !strings.Contains(system, "You cannot search the web") {
		t.Error("expected the estimate prompt")
	}
}

// A downlevel is priced at the level offered, with the posted title there so the model can say so.
func TestMarketCheckSendsTheOfferedAndPostedTitles(t *testing.T) {
	requests := useFakeProvider(t, "ollama", marketAnswer)

	w := doPost(t, MarketCheckHandler,
		`{"company":"Initech","role":"Software Engineer II","postedRole":"Senior Software Engineer","baseSalary":150000}`)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
	messages := (*requests)[0]["messages"].([]any)
	asked := messages[len(messages)-1].(map[string]any)["content"].(string)
	if !strings.Contains(asked, `"role":"Software Engineer II"`) || !strings.Contains(asked, `"postedRole":"Senior Software Engineer"`) {
		t.Errorf("expected both titles in the request, got %s", asked)
	}
	system := messages[0].(map[string]any)["content"].(string)
	if !strings.Contains(system, "level offered") {
		t.Error("expected the prompt to price the level offered")
	}
}

func TestMarketCheckRefusesAnAnswerItCannotShow(t *testing.T) {
	for _, reply := range []string{
		`{"verdict":"maybe","summary":"Hard to say."}`,
		`{"verdict":"at","summary":"  "}`,
	} {
		useFakeProvider(t, "ollama", reply)
		if w := doPost(t, MarketCheckHandler, offerBody); w.Code != http.StatusBadGateway {
			t.Errorf("reply %s: expected 502, got %d", reply, w.Code)
		}
	}
}

func TestMarketCheckNeedsACompanyAndRole(t *testing.T) {
	useFakeProvider(t, "ollama", marketAnswer)
	if w := doPost(t, MarketCheckHandler, `{"company":"Initech"}`); w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestOlderModelsGetTheBasicSearchTool(t *testing.T) {
	for model, want := range map[string]string{
		"claude-sonnet-5":   "web_search_20260209",
		"claude-opus-5-5":   "web_search_20260209",
		"claude-sonnet-4-6": "web_search_20260209",
		"claude-haiku-4-5":  "web_search_20250305",
		"claude-sonnet-4-5": "web_search_20250305",
	} {
		if got := webSearchTool(model); got != want {
			t.Errorf("%s: got %s, want %s", model, got, want)
		}
	}
}

func mustJSON(t *testing.T, v any) []byte {
	t.Helper()
	b, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	return b
}
