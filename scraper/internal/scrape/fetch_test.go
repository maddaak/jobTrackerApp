package scrape

import (
	"net"
	"testing"
)

// Pins the extra CGNAT/reserved/documentation ranges that must never be dialed.
func TestIsPublicIPRejectsReservedRanges(t *testing.T) {
	blocked := []string{
		"100.64.0.1", // CGNAT
		"100.127.255.1",
		"240.0.0.1",  // reserved
		"192.0.2.5",  // TEST-NET-1
		"198.18.0.1", // benchmarking
		"198.19.255.1",
		"0.1.2.3", // "this network"
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
