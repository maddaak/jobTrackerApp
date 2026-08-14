package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequireInternalTokenRejectsMissingOrWrongToken(t *testing.T) {
	handler := RequireInternalToken(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}, "expected-token")

	req := httptest.NewRequest(http.MethodPost, "/scrape", nil)
	w := httptest.NewRecorder()
	handler(w, req)
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 with no token, got %d", w.Code)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/scrape", nil)
	req2.Header.Set("X-Internal-Token", "wrong-token")
	w2 := httptest.NewRecorder()
	handler(w2, req2)
	if w2.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 with wrong token, got %d", w2.Code)
	}

	req3 := httptest.NewRequest(http.MethodPost, "/scrape", nil)
	req3.Header.Set("X-Internal-Token", "expected-token")
	w3 := httptest.NewRecorder()
	handler(w3, req3)
	if w3.Code != http.StatusOK {
		t.Fatalf("expected 200 with correct token, got %d", w3.Code)
	}
}
