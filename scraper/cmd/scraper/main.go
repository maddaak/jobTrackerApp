package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"jobtracker/scraper/internal/ai"
	"jobtracker/scraper/internal/httpx"
	"jobtracker/scraper/internal/scrape"
)

func main() {
	internalToken := os.Getenv("INTERNAL_TOKEN")
	if internalToken == "" {
		log.Fatal("INTERNAL_TOKEN is required; the scraper refuses to start without the shared service-to-service secret")
	}

	http.HandleFunc("/health", httpx.Health)
	http.HandleFunc("/scrape", httpx.RequireInternalToken(scrape.Handler, internalToken))
	http.HandleFunc("/analyze-resume", httpx.RequireInternalToken(ai.AnalyzeResumeHandler, internalToken))
	http.HandleFunc("/match-resume", httpx.RequireInternalToken(ai.MatchResumeHandler, internalToken))
	http.HandleFunc("/recommend-resume-variant", httpx.RequireInternalToken(ai.RecommendResumeVariantHandler, internalToken))
	http.HandleFunc("/ai-status", httpx.RequireInternalToken(ai.StatusHandler, internalToken))

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
