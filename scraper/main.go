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

// requireInternalToken enforces the shared service-to-service token on every route but /health.
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

	// Explicit timeouts so a slow client can't tie up a connection; WriteTimeout (130s) clears the slowest AI call (30s x up to 3 attempts).
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      nil,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 130 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}
