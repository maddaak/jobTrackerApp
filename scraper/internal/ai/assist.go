package ai

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"jobtracker/scraper/internal/httpx"
	"jobtracker/scraper/internal/textutil"
)

// An assist is one button in the app: a task, the input it can't do without, and the answer it returns.
// They share one handler because they differ only in those, and the bff gathers each one's input.
type assist struct {
	task   string
	schema string
	// Input fields that must be present and, for text, not blank.
	required []string
	// Searches the web where the provider can; elsewhere the answer says it comes from general knowledge.
	search    bool
	maxTokens int
	newAnswer func() answer
}

// ready fills any list the model left out, so the page always gets one, and says whether the answer is usable.
type answer interface {
	ready() bool
}

// Embedded by the answers that can search, so the page can say whether it cites anything.
type researched struct {
	Searched bool     `json:"searched"`
	Sources  []source `json:"sources"`
}

func (r *researched) setResearch(searched bool, sources []source) {
	r.Searched = searched
	r.Sources = sources
	if r.Sources == nil {
		r.Sources = []source{}
	}
}

type companyBrief struct {
	Overview         string   `json:"overview"`
	Facts            []string `json:"facts"`
	RecentNews       []string `json:"recentNews"`
	InterviewProcess string   `json:"interviewProcess"`
	WatchOuts        []string `json:"watchOuts"`
	researched
}

func (a *companyBrief) ready() bool {
	fill(&a.Facts, &a.RecentNews, &a.WatchOuts)
	return strings.TrimSpace(a.Overview) != ""
}

type practiceItem struct {
	Title string `json:"title"`
	URL   string `json:"url"`
	Why   string `json:"why"`
}

type interviewPrep struct {
	Focus           string         `json:"focus"`
	Practice        []practiceItem `json:"practice"`
	Topics          []string       `json:"topics"`
	LikelyQuestions []string       `json:"likelyQuestions"`
	StoriesToTell   []string       `json:"storiesToTell"`
	QuestionsToAsk  []string       `json:"questionsToAsk"`
	researched
}

func (a *interviewPrep) ready() bool {
	fill(&a.Topics, &a.LikelyQuestions, &a.StoriesToTell, &a.QuestionsToAsk)
	// The page renders these as links, so one that isn't a web address is dropped rather than shown broken.
	linked := []practiceItem{}
	for _, item := range a.Practice {
		if strings.TrimSpace(item.Title) != "" && (strings.HasPrefix(item.URL, "https://") || strings.HasPrefix(item.URL, "http://")) {
			linked = append(linked, item)
		}
	}
	a.Practice = linked
	return strings.TrimSpace(a.Focus) != "" && len(a.LikelyQuestions)+len(a.Practice) > 0
}

type debrief struct {
	Summary      string   `json:"summary"`
	ThankYouNote string   `json:"thankYouNote"`
	FollowUps    []string `json:"followUps"`
}

func (a *debrief) ready() bool {
	fill(&a.FollowUps)
	return strings.TrimSpace(a.Summary) != "" && strings.TrimSpace(a.ThankYouNote) != ""
}

type emailDraft struct {
	Subject string `json:"subject"`
	Body    string `json:"body"`
	// What a negotiation email asks for, listed so the candidate can check them against the body.
	Asks []string `json:"asks"`
}

func (a *emailDraft) ready() bool {
	fill(&a.Asks)
	return strings.TrimSpace(a.Subject) != "" && strings.TrimSpace(a.Body) != ""
}

type bulletChange struct {
	Current   string `json:"current"`
	Suggested string `json:"suggested"`
	Why       string `json:"why"`
}

type tailoring struct {
	Summary       string         `json:"summary"`
	KeywordsToAdd []string       `json:"keywordsToAdd"`
	BulletChanges []bulletChange `json:"bulletChanges"`
}

func (a *tailoring) ready() bool {
	fill(&a.KeywordsToAdd)
	if a.BulletChanges == nil {
		a.BulletChanges = []bulletChange{}
	}
	return strings.TrimSpace(a.Summary) != ""
}

type pattern struct {
	Title  string `json:"title"`
	Detail string `json:"detail"`
}

type insights struct {
	Summary   string    `json:"summary"`
	Patterns  []pattern `json:"patterns"`
	NextSteps []string  `json:"nextSteps"`
}

func (a *insights) ready() bool {
	fill(&a.NextSteps)
	if a.Patterns == nil {
		a.Patterns = []pattern{}
	}
	return strings.TrimSpace(a.Summary) != ""
}

func fill(lists ...*[]string) {
	for _, list := range lists {
		if *list == nil {
			*list = []string{}
		}
	}
}

var assists = map[string]assist{
	"company-brief": {
		task:      companyBriefTask,
		schema:    `{"overview": "<2 to 4 sentences>", "facts": ["..."], "recentNews": ["..."], "interviewProcess": "<1 to 3 sentences, or empty>", "watchOuts": ["..."]}`,
		required:  []string{"company"},
		search:    true,
		maxTokens: 8192,
		newAnswer: func() answer { return &companyBrief{} },
	},
	"interview-prep": {
		task:      interviewPrepTask,
		schema:    `{"focus": "<1 to 2 sentences>", "practice": [{"title": "...", "url": "https://...", "why": "<a few words>"}], "topics": ["..."], "likelyQuestions": ["..."], "storiesToTell": ["..."], "questionsToAsk": ["..."]}`,
		required:  []string{"company", "role", "roundType"},
		search:    true,
		maxTokens: 8192,
		newAnswer: func() answer { return &interviewPrep{} },
	},
	"debrief": {
		task:      debriefTask,
		schema:    `{"summary": "<3 to 6 sentences>", "thankYouNote": "<the email body>", "followUps": ["..."]}`,
		required:  []string{"company", "notes"},
		maxTokens: 4096,
		newAnswer: func() answer { return &debrief{} },
	},
	"follow-up": {
		task:      followUpTask,
		schema:    `{"subject": "...", "body": "<the email body>", "asks": []}`,
		required:  []string{"company", "role", "lastRound"},
		maxTokens: 2048,
		newAnswer: func() answer { return &emailDraft{} },
	},
	"negotiation": {
		task:      negotiationTask,
		schema:    `{"subject": "...", "body": "<the email body>", "asks": ["..."]}`,
		required:  []string{"company", "offer"},
		maxTokens: 4096,
		newAnswer: func() answer { return &emailDraft{} },
	},
	"tailor-resume": {
		task:      tailorResumeTask,
		schema:    `{"summary": "<2 to 3 sentences>", "keywordsToAdd": ["..."], "bulletChanges": [{"current": "<bullet as written>", "suggested": "<rewrite>", "why": "<one sentence>"}]}`,
		required:  []string{"jobDescription", "resumeText"},
		maxTokens: 6144,
		newAnswer: func() answer { return &tailoring{} },
	},
	"insights": {
		task:      insightsTask,
		schema:    `{"summary": "<2 to 4 sentences>", "patterns": [{"title": "<a few words>", "detail": "<1 to 2 sentences citing the numbers>"}], "nextSteps": ["..."]}`,
		required:  []string{"stats"},
		maxTokens: 4096,
		newAnswer: func() answer { return &insights{} },
	},
}

var errMissingInput = errors.New("missing input")

// AssistHandler serves /assist/<name>, one route per button in the app.
func AssistHandler(w http.ResponseWriter, r *http.Request) {
	name := strings.TrimPrefix(r.URL.Path, "/assist/")
	spec, known := assists[name]
	if !known {
		httpx.WriteError(w, http.StatusNotFound, "unknown assist")
		return
	}
	var input map[string]any
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, httpx.MaxBodyBytes)).Decode(&input); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	result, err := runAssist(r.Context(), name, spec, input)
	if errors.Is(err, errMissingInput) {
		httpx.WriteError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		writeAIError(w, err)
		return
	}
	httpx.WriteJSON(w, http.StatusOK, result)
}

func runAssist(ctx context.Context, name string, spec assist, input map[string]any) (answer, error) {
	for _, field := range spec.required {
		value, present := input[field]
		text, isText := value.(string)
		if !present || value == nil || (isText && strings.TrimSpace(text) == "") {
			return nil, fmt.Errorf("%w: %s is required", errMissingInput, field)
		}
	}
	// Per field, so one long description can't push the rest of the input out of the prompt.
	capStrings(input)
	inputJSON, err := json.Marshal(input)
	if err != nil {
		return nil, fmt.Errorf("marshal input: %w", err)
	}
	userMessage := "Input (JSON):\n" + string(inputJSON)

	result := spec.newAnswer()
	var raw string
	if spec.search {
		note := estimateNote
		if canSearch() {
			note = searchNote
		}
		prompt := spec.task + "\n\n" + note + "\n\n" + untrustedInput +
			"\n\nEnd your answer with ONLY a JSON object (no markdown fences, nothing after it) matching exactly this schema: " + spec.schema
		var sources []source
		var searched bool
		raw, sources, searched, err = research(ctx, prompt, userMessage, spec.maxTokens)
		if err != nil {
			return nil, err
		}
		if err := decodeObject(name, raw, result); err != nil {
			return nil, err
		}
		result.(interface{ setResearch(bool, []source) }).setResearch(searched, sources)
	} else {
		prompt := spec.task + "\n\n" + untrustedInput +
			"\n\nRespond with ONLY valid JSON (no markdown fences, no commentary) matching exactly this schema: " + spec.schema
		if raw, err = ask(ctx, name, prompt, userMessage, spec.maxTokens, result); err != nil {
			return nil, err
		}
	}
	if !result.ready() {
		log.Printf("%s: answer was missing what the page shows; raw response: %s", name, textutil.Truncate(raw, 2000))
		return nil, errBadResponse
	}
	return result, nil
}

func capStrings(value any) {
	switch v := value.(type) {
	case map[string]any:
		for key, item := range v {
			if text, ok := item.(string); ok {
				v[key] = textutil.Truncate(text, maxPromptChars)
			} else {
				capStrings(item)
			}
		}
	case []any:
		for i, item := range v {
			if text, ok := item.(string); ok {
				v[i] = textutil.Truncate(text, maxPromptChars)
			} else {
				capStrings(item)
			}
		}
	}
}
