package ai

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// The least each assist needs, and the least answer the page can show. Every assist must have both,
// so one added to the table without them fails here.
var assistCases = map[string]struct{ input, answer string }{
	"company-brief":  {`{"company":"Initech"}`, `{"overview":"Makes software."}`},
	"interview-prep": {`{"company":"Initech","role":"Engineer","roundType":"System design"}`, `{"focus":"Design.","likelyQuestions":["Design a cache."]}`},
	"debrief":        {`{"company":"Initech","notes":"Talked about caching."}`, `{"summary":"Went well.","thankYouNote":"Thanks!"}`},
	"follow-up":      {`{"company":"Initech","role":"Engineer","lastRound":{"type":"Panel"}}`, `{"subject":"Following up","body":"Hi."}`},
	"negotiation":    {`{"company":"Initech","offer":{"baseSalary":150000}}`, `{"subject":"Offer","body":"Hi."}`},
	"tailor-resume":  {`{"jobDescription":"Go and Kafka.","resumeText":"Built things."}`, `{"summary":"Close."}`},
	"insights":       {`{"stats":{"applied":10}}`, `{"summary":"Few interviews."}`},
}

func postAssist(t *testing.T, name, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/assist/"+name, bytes.NewReader([]byte(body)))
	w := httptest.NewRecorder()
	AssistHandler(w, req)
	return w
}

func TestEveryAssistHasATestCase(t *testing.T) {
	for name := range assists {
		if _, ok := assistCases[name]; !ok {
			t.Errorf("assist %q has no entry in assistCases", name)
		}
	}
}

func TestEveryAssistRefusesInputMissingARequiredField(t *testing.T) {
	useFakeProvider(t, "openai", "{}")
	for name, spec := range assists {
		for _, field := range spec.required {
			var input map[string]any
			_ = json.Unmarshal([]byte(assistCases[name].input), &input)
			delete(input, field)
			w := postAssist(t, name, string(mustJSON(t, input)))
			if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), field) {
				t.Errorf("%s without %s: expected 400 naming it, got %d %s", name, field, w.Code, w.Body.String())
			}
			input[field] = "  "
			if w := postAssist(t, name, string(mustJSON(t, input))); w.Code != http.StatusBadRequest {
				t.Errorf("%s with blank %s: expected 400, got %d", name, field, w.Code)
			}
		}
	}
}

func TestEveryAssistSaysWhenNoProviderIsSetUp(t *testing.T) {
	t.Setenv("AI_PROVIDER", "")
	t.Setenv("AI_API_KEY", "")
	t.Setenv("ANTHROPIC_API_KEY", "")
	for name, c := range assistCases {
		w := postAssist(t, name, c.input)
		if w.Code != http.StatusServiceUnavailable || !strings.Contains(w.Body.String(), "not_configured") {
			t.Errorf("%s: expected 503 not_configured, got %d %s", name, w.Code, w.Body.String())
		}
	}
}

// "{}" parses cleanly, so without the check it would be saved as an empty brief, draft, or summary.
func TestEveryAssistRefusesAnAnswerThePageCannotShow(t *testing.T) {
	useFakeProvider(t, "openai", "{}")
	for name, c := range assistCases {
		if w := postAssist(t, name, c.input); w.Code != http.StatusBadGateway {
			t.Errorf("%s: expected 502, got %d", name, w.Code)
		}
	}
}

// The page maps over every list, so one the model left out comes back empty rather than null.
func TestEveryAssistAnswersWithEveryListPresent(t *testing.T) {
	for name, c := range assistCases {
		useFakeProvider(t, "openai", c.answer)
		w := postAssist(t, name, c.input)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: expected 200, got %d %s", name, w.Code, w.Body.String())
		}
		if strings.Contains(w.Body.String(), "null") {
			t.Errorf("%s: expected no null fields, got %s", name, w.Body.String())
		}
	}
}

func TestEveryAssistMarksItsInputAsDataAndAsksForItsSchema(t *testing.T) {
	for name, c := range assistCases {
		requests := useFakeProvider(t, "openai", c.answer)
		postAssist(t, name, c.input)
		system := (*requests)[0]["messages"].([]any)[0].(map[string]any)["content"].(string)
		if !strings.Contains(system, untrustedInput) || !strings.Contains(system, assists[name].schema) {
			t.Errorf("%s: system prompt is missing the data rule or the schema", name)
		}
	}
}

func TestSearchingAssistsCiteTheirSourcesWhereTheToolCanSearch(t *testing.T) {
	for name, spec := range assists {
		if !spec.search {
			continue
		}
		reply := searchedReply("end_turn")
		content := reply["content"].([]map[string]any)
		content[len(content)-1] = map[string]any{"type": "text", "text": assistCases[name].answer}
		requests := scriptedServer(t, reply)

		w := postAssist(t, name, assistCases[name].input)

		var result researched
		_ = json.Unmarshal(w.Body.Bytes(), &result)
		if !result.Searched || len(result.Sources) != 1 {
			t.Errorf("%s: expected a searched answer with its source, got %s", name, w.Body.String())
		}
		system := (*requests)[0]["system"].([]any)[0].(map[string]any)["text"].(string)
		if !strings.Contains(system, searchNote) {
			t.Errorf("%s: expected the search note in the prompt", name)
		}
	}
}

func TestSearchingAssistsSayTheyAreEstimatesWhereTheToolCannotSearch(t *testing.T) {
	for name, spec := range assists {
		if !spec.search {
			continue
		}
		requests := useFakeProvider(t, "openai", assistCases[name].answer)

		w := postAssist(t, name, assistCases[name].input)

		var result researched
		_ = json.Unmarshal(w.Body.Bytes(), &result)
		if result.Searched || result.Sources == nil {
			t.Errorf("%s: expected an unsearched answer with an empty source list, got %s", name, w.Body.String())
		}
		system := (*requests)[0]["messages"].([]any)[0].(map[string]any)["content"].(string)
		if !strings.Contains(system, estimateNote) {
			t.Errorf("%s: expected the estimate note in the prompt", name)
		}
	}
}

func TestAssistCapsEachLongFieldSoTheRestStillFits(t *testing.T) {
	requests := useFakeProvider(t, "openai", assistCases["tailor-resume"].answer)
	long := strings.Repeat("a", maxPromptChars+500)

	postAssist(t, "tailor-resume", string(mustJSON(t, map[string]any{
		"jobDescription": long, "resumeText": "Built things.", "extra": []any{map[string]any{"note": long}},
	})))

	user := (*requests)[0]["messages"].([]any)[1].(map[string]any)["content"].(string)
	if strings.Contains(user, long) || !strings.Contains(user, "Built things.") {
		t.Errorf("expected each long field cut to the cap and the short ones kept")
	}
}

func TestPrepDropsPracticeItemsThatAreNotLinks(t *testing.T) {
	useFakeProvider(t, "openai", `{"focus":"Coding.","practice":[`+
		`{"title":"Two Sum","url":"https://leetcode.com/problems/two-sum/","why":"hashing"},`+
		`{"title":"Made up","url":"leetcode two sum","why":"x"},`+
		`{"title":"","url":"https://example.com/","why":"x"}]}`)

	w := postAssist(t, "interview-prep", assistCases["interview-prep"].input)

	var prep interviewPrep
	_ = json.Unmarshal(w.Body.Bytes(), &prep)
	if w.Code != http.StatusOK || len(prep.Practice) != 1 || prep.Practice[0].Title != "Two Sum" {
		t.Fatalf("expected only the linked item kept, got %d %s", w.Code, w.Body.String())
	}
}

func TestUnknownAssistIsNotFound(t *testing.T) {
	if w := postAssist(t, "horoscope", `{}`); w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}
