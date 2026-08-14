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

type matchResult struct {
	BestResumeID   string `json:"bestResumeId"`
	Recommendation string `json:"recommendation"`
	Reasoning      string `json:"reasoning"`
}

// LLM second opinion alongside core's rules-based matcher; variant blurbs come from the caller.
type resumeVariantBlurb struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Blurb       string `json:"blurb"`
}

type recommendVariantRequest struct {
	JobDescriptionText string               `json:"jobDescriptionText"`
	Variants           []resumeVariantBlurb `json:"variants"`
}

type recommendVariantResult struct {
	VariantID string `json:"variantId"`
	Reason    string `json:"reason"`
}

// The exact set bff and web are typed against; a parse outside it is a failure, not a verdict.
var validRecommendations = map[string]bool{
	"APPLY":           true,
	"DO_NOT_APPLY":    true,
	"INSUFFICIENT_JD": true,
}

// Generous per-resume cap; guards against a pathological upload, not normal use.
const maxResumeChars = 8000

// Bound the item count so an unbounded list can't blow the model's context window.
const maxResumes = 50
const maxResumeVariants = 50
