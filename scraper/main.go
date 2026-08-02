package main

import (
	"crypto/subtle"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"
)

func health(w http.ResponseWriter, r *http.Request) {
	_ = json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "scraper"})
}

// requireInternalToken mirrors core's InternalTokenFilter: every route except /health
// requires the shared service-to-service token, since only the BFF should ever reach
// this service (it lives off the public network in docker-compose).
func requireInternalToken(next http.HandlerFunc, expectedToken string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provided := r.Header.Get("X-Internal-Token")
		if subtle.ConstantTimeCompare([]byte(provided), []byte(expectedToken)) != 1 {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func main() {
	internalToken := os.Getenv("INTERNAL_TOKEN")
	if internalToken == "" {
		log.Fatal("INTERNAL_TOKEN is required; the scraper refuses to start without the shared service-to-service secret")
	}

	http.HandleFunc("/health", health)
	http.HandleFunc("/scrape", requireInternalToken(scrapeHandler, internalToken))
	http.HandleFunc("/analyze-resume", requireInternalToken(analyzeResumeHandler, internalToken))
	http.HandleFunc("/match-resume", requireInternalToken(matchResumeHandler, internalToken))
	http.HandleFunc("/recommend-resume-variant", requireInternalToken(recommendResumeVariantHandler, internalToken))
	http.HandleFunc("/ai-status", requireInternalToken(aiStatusHandler, internalToken))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	log.Printf("scraper listening on :%s", port)

	// Explicit timeouts so a slow or stuck client cannot tie up a connection indefinitely.
	// WriteTimeout must clear the slowest legitimate response: an AI handler can take up to the
	// claude client timeout (30s) per attempt, times up to 3 attempts with backoff on transient
	// failures, so 130s leaves headroom without truncating a real AI response mid-flight.
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      nil, // nil uses http.DefaultServeMux, where the routes above are registered
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 130 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}
