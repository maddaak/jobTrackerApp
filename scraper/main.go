package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
)

func health(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{"status": "ok", "service": "scraper"})
}

// requireInternalToken mirrors core's InternalTokenFilter: every route except /health
// requires the shared service-to-service token, since only the BFF should ever reach
// this service (it lives off the public network in docker-compose).
func requireInternalToken(next http.HandlerFunc, expectedToken string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Internal-Token") != expectedToken {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}

func main() {
	internalToken := os.Getenv("INTERNAL_TOKEN")

	http.HandleFunc("/health", health)
	http.HandleFunc("/scrape", requireInternalToken(scrapeHandler, internalToken))
	http.HandleFunc("/analyze-resume", requireInternalToken(analyzeResumeHandler, internalToken))
	http.HandleFunc("/match-resume", requireInternalToken(matchResumeHandler, internalToken))

	port := os.Getenv("PORT")
	if port == "" {
		port = "8081"
	}
	log.Printf("scraper listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
