package ai

type resumeAnalysis struct {
	Summary   string   `json:"summary"`
	Skills    []string `json:"skills"`
	Seniority string   `json:"seniority"`
	Roles     []string `json:"roles"`
}

type analyzeResumeRequest struct {
	Text string `json:"text"`
}

// Full resume text, not summaries: summaries compressed away detail and gave inconsistent picks.
type resumeDocument struct {
	ID       string `json:"id"`
	FileName string `json:"fileName"`
	FullText string `json:"fullText"`
}

type matchResumeRequest struct {
	JobDescriptionText string           `json:"jobDescriptionText"`
	Resumes            []resumeDocument `json:"resumes"`
}

// Strengths and gaps are a few words each: the form shows them as one line, not a paragraph.
type matchResult struct {
	BestResumeID   string   `json:"bestResumeId"`
	Recommendation string   `json:"recommendation"`
	Company        string   `json:"company"`
	Role           string   `json:"role"`
	Strengths      []string `json:"strengths"`
	Gaps           []string `json:"gaps"`
}

// The exact set bff and web are typed against; a parse outside it is a failure, not a verdict.
var validRecommendations = map[string]bool{
	"APPLY":           true,
	"DO_NOT_APPLY":    true,
	"INSUFFICIENT_JD": true,
}

// Amounts are annual; nil means not recorded yet, which the prompt must not read as zero.
type offerDetails struct {
	ID                string `json:"id"`
	Company           string `json:"company"`
	Role              string `json:"role"`
	PostedRole        string `json:"postedRole"`
	Location          string `json:"location"`
	BaseSalary        *int   `json:"baseSalary"`
	AnnualBonus       *int   `json:"annualBonus"`
	EquityPerYear     *int   `json:"equityPerYear"`
	EquityByYear      []int  `json:"equityByYear"`
	SignOnByYear      []int  `json:"signOnByYear"`
	AveragePerYear    *int   `json:"averagePerYear"`
	AveragedOverYears int    `json:"averagedOverYears"`
	CompByYear        []int  `json:"compByYear"`
	// The letter's assumed yearly share-price rise and the pay by year with it; unset when none is assumed.
	PriceGrowthPercent  *float64 `json:"priceGrowthPercent"`
	ProjectedCompByYear []int    `json:"projectedCompByYear"`
	StartDate           string   `json:"startDate"`
	DecisionDeadline    string   `json:"decisionDeadline"`
	Notes               string   `json:"notes"`
}

type compareOffersRequest struct {
	Priorities string         `json:"priorities"`
	Offers     []offerDetails `json:"offers"`
}

type offerAssessment struct {
	ID                string   `json:"id"`
	Pros              []string `json:"pros"`
	Cons              []string `json:"cons"`
	NegotiationPoints []string `json:"negotiationPoints"`
}

type compareOffersResult struct {
	RecommendedOfferID string            `json:"recommendedOfferId"`
	Summary            string            `json:"summary"`
	Offers             []offerAssessment `json:"offers"`
}

// Amounts are annual and nil when not recorded; location is the work model (remote, hybrid, in person).
// Role is the title offered; PostedRole is the posting's, set only when the offer came in at a different one.
type marketCheckRequest struct {
	Company       string `json:"company"`
	Role          string `json:"role"`
	PostedRole    string `json:"postedRole"`
	Location      string `json:"location"`
	BaseSalary    *int   `json:"baseSalary"`
	AnnualBonus   *int   `json:"annualBonus"`
	EquityPerYear *int   `json:"equityPerYear"`
	// Across every year it's paid in.
	SignOnTotal *int `json:"signOnTotal"`
}

type marketCheckResult struct {
	Verdict           string   `json:"verdict"`
	TypicalLow        *int     `json:"typicalLow"`
	TypicalHigh       *int     `json:"typicalHigh"`
	Summary           string   `json:"summary"`
	NegotiationPoints []string `json:"negotiationPoints"`
	// False when the provider can't search: the verdict is the model's own estimate, with no sources.
	Searched bool     `json:"searched"`
	Sources  []source `json:"sources"`
}

var validVerdicts = map[string]bool{"below": true, "at": true, "above": true, "unclear": true}

const maxOffers = 20

// Generous per-resume cap; guards against a pathological upload, not normal use.
const maxResumeChars = 8000

// Bound the item count so an unbounded list can't blow the model's context window.
const maxResumes = 50
