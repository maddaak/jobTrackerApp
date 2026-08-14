package httpx

import (
	"crypto/subtle"
	"net/http"
)

// RequireInternalToken enforces the shared service-to-service token on every route but /health.
func RequireInternalToken(next http.HandlerFunc, expectedToken string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		provided := r.Header.Get("X-Internal-Token")
		if subtle.ConstantTimeCompare([]byte(provided), []byte(expectedToken)) != 1 {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		next(w, r)
	}
}
