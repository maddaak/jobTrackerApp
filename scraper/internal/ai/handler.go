package ai

import (
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"jobtracker/scraper/internal/httpx"
)

// StatusHandler reports whether an AI provider is usable, since only the scraper holds its settings.
func StatusHandler(w http.ResponseWriter, r *http.Request) {
	_, err := configuredProvider()
	httpx.WriteJSON(w, http.StatusOK, map[string]bool{"configured": err == nil})
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

func CompareOffersHandler(w http.ResponseWriter, r *http.Request) {
	var req compareOffersRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, httpx.MaxBodyBytes)).Decode(&req); err != nil || len(req.Offers) == 0 {
		httpx.WriteError(w, http.StatusBadRequest, "at least one offer is required")
		return
	}
	if len(req.Offers) > maxOffers {
		httpx.WriteError(w, http.StatusBadRequest, "too many offers")
		return
	}

	result, err := compareOffers(r.Context(), req)
	if err != nil {
		writeAIError(w, err)
		return
	}

	httpx.WriteJSON(w, http.StatusOK, result)
}

func MarketCheckHandler(w http.ResponseWriter, r *http.Request) {
	var req marketCheckRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, httpx.MaxBodyBytes)).Decode(&req); err != nil ||
		strings.TrimSpace(req.Company) == "" || strings.TrimSpace(req.Role) == "" {
		httpx.WriteError(w, http.StatusBadRequest, "company and role are required")
		return
	}

	result, err := checkMarket(r.Context(), req)
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
	case errors.Is(err, errBadResponse):
		// The service already logged the raw response it couldn't use.
		httpx.WriteError(w, http.StatusBadGateway, "unavailable")
	default:
		log.Printf("AI call failed: %v", err)
		httpx.WriteError(w, http.StatusBadGateway, "unavailable")
	}
}
