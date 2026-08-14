// Package httpx holds the HTTP plumbing every route shares: body limits, JSON responses, and the
// internal-token gate.
package httpx

import (
	"encoding/json"
	"net/http"
)

// MaxBodyBytes caps request and fetched-page bodies so a huge payload can't exhaust memory.
const MaxBodyBytes = 5 << 20 // 5MB

func WriteJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func WriteError(w http.ResponseWriter, status int, message string) {
	WriteJSON(w, status, map[string]string{"error": message})
}
