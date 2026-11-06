package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"jobtracker/scraper/internal/ai"
	"jobtracker/scraper/internal/httpx"
	"jobtracker/scraper/internal/scrape"
)

func main() {
	// Not core's token, so a scraper that's broken into can't call core. A compose file from before it passes only INTERNAL_TOKEN.
	internalToken := os.Getenv("SCRAPER_TOKEN")
	if internalToken == "" {
		internalToken = os.Getenv("INTERNAL_TOKEN")
	}
	if internalToken == "" {
		log.Fatal("SCRAPER_TOKEN is required; the scraper refuses to start without the bff's secret")
	}
	// .env.example's placeholders are public on GitHub, so one left in place guards nothing.
	if strings.HasPrefix(internalToken, "change_me") {
		log.Fatal("SCRAPER_TOKEN is still the .env.example placeholder; set a real value (openssl rand -hex 32)")
	}

	if err := ai.ValidateConfig(); err != nil {
		log.Fatal(err)
	}

	// Our own mux: anything a dependency registers on DefaultServeMux would otherwise be served unauthenticated.
	mux := http.NewServeMux()
	mux.HandleFunc("/health", httpx.Health)
	mux.HandleFunc("/scrape", httpx.RequireInternalToken(scrape.Handler, internalToken))
	mux.HandleFunc("/analyze-resume", httpx.RequireInternalToken(ai.AnalyzeResumeHandler, internalToken))
	mux.HandleFunc("/match-resume", httpx.RequireInternalToken(ai.MatchResumeHandler, internalToken))
	mux.HandleFunc("/compare-offers", httpx.RequireInternalToken(ai.CompareOffersHandler, internalToken))
	mux.HandleFunc("/market-check", httpx.RequireInternalToken(ai.MarketCheckHandler, internalToken))
	mux.HandleFunc("/scrape-text", httpx.RequireInternalToken(scrape.TextHandler, internalToken))
	mux.HandleFunc("/assist/", httpx.RequireInternalToken(ai.AssistHandler, internalToken))
	mux.HandleFunc("/ai-status", httpx.RequireInternalToken(ai.StatusHandler, internalToken))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	log.Printf("scraper listening on :%s", port)

	// Explicit timeouts so a slow client can't tie up a connection. WriteTimeout (130s) clears the slowest
	// AI call, which is capped at 100s across all its attempts (ai.callBudget), inside the bff's 120s.
	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 130 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	log.Fatal(srv.ListenAndServe())
}
