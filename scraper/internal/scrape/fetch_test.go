package scrape

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"testing"
)

// This is the app's only SSRF guard, so every way of spelling an internal host must be refused here:
// plain, every IPv4 encoding a resolver accepts, IPv6 and IPv4-mapped IPv6, and the reserved ranges.
func TestIsSafeScrapeURLRefusesEveryInternalSpelling(t *testing.T) {
	refused := []string{
		"http://localhost/job",
		"http://127.0.0.1/job",
		"http://10.0.0.5/job",
		"http://192.168.1.1/job",
		"http://172.16.0.1/job",
		"http://169.254.169.254/latest/meta-data", // cloud metadata
		"http://100.64.0.1/job",                   // CGNAT
		"http://0.0.0.0/job",
		"http://2130706433/job", // 127.0.0.1 as one integer
		"http://0x7f000001/job", // as hex
		"http://0177.0.0.1/job", // as octal
		"http://127.1/job",      // short form
		"http://[::1]/job",
		"http://[::]/job",
		"http://[::ffff:127.0.0.1]/job", // IPv4-mapped
		"http://[::ffff:7f00:1]/job",    // IPv4-mapped, hex groups
		"http://[fd00::1]/job",          // unique local
		"http://[fe80::1]/job",          // link local
	}
	for _, url := range refused {
		if isSafeScrapeURL(context.Background(), url) {
			t.Errorf("expected %s to be refused", url)
		}
	}
	if !isSafeScrapeURL(context.Background(), "http://93.184.216.34/job") {
		t.Error("expected a public IP literal to be allowed")
	}
}

// The checks after the first one: a DNS answer that changed since (rebinding) and a redirect inward.
// Both must be told apart from a dead host so the user sees "blocked", not "unreachable".
func TestRefusalsAfterTheFirstCheckAreReportedAsUnsafe(t *testing.T) {
	_, err := safeDialContext(context.Background(), "tcp", "127.0.0.1:80")
	if !errors.Is(err, errUnsafeHost) {
		t.Errorf("dial to loopback: expected errUnsafeHost, got %v", err)
	}

	redirect := httptest.NewRequest(http.MethodGet, "http://169.254.169.254/latest/meta-data", nil)
	if err := safeFetchClient.CheckRedirect(redirect, nil); !errors.Is(err, errUnsafeHost) {
		t.Errorf("redirect to metadata: expected errUnsafeHost, got %v", err)
	}
}

// Go's net.IP predicates miss these ranges, so blockedIPNets is all that refuses them.
func TestIsPublicIPRejectsReservedRanges(t *testing.T) {
	blocked := []string{
		"100.64.0.1",
		"100.127.255.1",
		"240.0.0.1",
		"192.0.2.5",
		"198.18.0.1",
		"198.19.255.1",
		"0.1.2.3",
	}
	for _, s := range blocked {
		if isPublicIP(net.ParseIP(s)) {
			t.Errorf("expected %s to be rejected as non-public", s)
		}
	}
	for _, s := range []string{"8.8.8.8", "1.1.1.1", "93.184.216.34"} {
		if !isPublicIP(net.ParseIP(s)) {
			t.Errorf("expected %s to be accepted as public", s)
		}
	}
}
