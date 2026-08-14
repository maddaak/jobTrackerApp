package ai

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"strings"

	"jobtracker/scraper/internal/httpx"
)

// StatusHandler reports whether the API key is configured, since only the scraper holds it.
func StatusHandler(w http.ResponseWriter, r *http.Request) {
	configured := os.Getenv("ANTHROPIC_API_KEY") != ""
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"configured": configured})
}

func AnalyzeResumeHandler(w http.ResponseWriter, r *http.Request) {
	var req analyzeResumeRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, httpx.MaxBodyBytes)).Decode(&req); err != nil || strings.TrimSpace(req.Text) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "text is required")
		return
	}

	analysis, err := analyzeResume(r.Context(), req.Text)
	if err != nil {
		writeAIError(w, err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, analysis)
}

func MatchResumeHandler(w http.ResponseWriter, r *http.Request) {
	var req matchResumeRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, httpx.MaxBodyBytes)).Decode(&req); err != nil ||
		strings.TrimSpace(req.JobDescriptionText) == "" || len(req.Resumes) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "jobDescriptionText and at least one resume are required")
		return
	}
	if len(req.Resumes) > maxResumes {
		httpx.WriteError(w, http.StatusBadRequest, "too many resumes")
		return
	}

	result, err := matchResume(r.Context(), req)
	if err != nil {
		writeAIError(w, err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, result)
}

func RecommendResumeVariantHandler(w http.ResponseWriter, r *http.Request) {
	var req recommendVariantRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, httpx.MaxBodyBytes)).Decode(&req); err != nil ||
		strings.TrimSpace(req.JobDescriptionText) == "" || len(req.Variants) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "jobDescriptionText and at least one variant are required")
		return
	}
	if len(req.Variants) > maxResumeVariants {
		httpx.WriteError(w, http.StatusBadRequest, "too many variants")
		return
	}

	result, err := recommendVariant(r.Context(), req)
	if err != nil {
		writeAIError(w, err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, result)
}

// writeAIError maps a service error to the shared contract: 503 no key, 502 anything else.
func writeAIError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errNotConfigured):
		httpx.WriteError(w, http.StatusServiceUnavailable, "not_configured")
	case errors.Is(err, errInvalidVariants):
		httpx.WriteError(w, http.StatusBadRequest, "invalid variants")
	case errors.Is(err, errBadResponse):
		// The service already logged the raw response it couldn't use.
		httpx.WriteError(w, http.StatusBadGateway, "unavailable")
	default:
		log.Printf("claude call failed: %v", err)
		httpx.WriteError(w, http.StatusBadGateway, "unavailable")
	}
}
