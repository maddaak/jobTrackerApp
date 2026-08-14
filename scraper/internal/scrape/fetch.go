package scrape

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"time"
)

var httpClient = &http.Client{Timeout: 8 * time.Second}

// SSRF guard on the user URL; a package var so tests can disable it for 127.0.0.1 fixtures.
var blockInternalHosts = true

// blockedIPNets are must-never-dial ranges Go's net.IP predicates miss: CGNAT, reserved, docs/test, 0.0.0.0/8.
var blockedIPNets = func() []*net.IPNet {
	nets := make([]*net.IPNet, 0, 5)
	for _, cidr := range []string{
		"100.64.0.0/10", // CGNAT (RFC 6598)
		"240.0.0.0/4",   // reserved / future use
		"192.0.2.0/24",  // TEST-NET-1 documentation
		"198.18.0.0/15", // benchmarking
		"0.0.0.0/8",     // "this network"
	} {
		_, n, err := net.ParseCIDR(cidr)
		if err != nil {
			panic(fmt.Sprintf("invalid blocked CIDR %q: %v", cidr, err))
		}
		nets = append(nets, n)
	}
	return nets
}()

// isPublicIP reports whether ip is a routable public address safe to dial.
func isPublicIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() || ip.IsUnspecified() || ip.IsPrivate() {
		return false
	}
	for _, blocked := range blockedIPNets {
		if blocked.Contains(ip) {
			return false
		}
	}
	return true
}

// isSafeScrapeURL rejects a URL whose host (IP literal, or any resolved IP) isn't public, for SSRF.
func isSafeScrapeURL(ctx context.Context, rawURL string) bool {
	if !blockInternalHosts {
		return true
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	host := parsed.Hostname()
	if host == "" {
		return false
	}
	if ip := net.ParseIP(host); ip != nil {
		return isPublicIP(ip)
	}
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
	if err != nil || len(ips) == 0 {
		return false
	}
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return false
		}
	}
	return true
}

var safeDialer = &net.Dialer{Timeout: 5 * time.Second}

// Dial only vetted public IPs so DNS rebinding can't slip a private IP past the pre-check.
func safeDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	if ip := net.ParseIP(host); ip != nil {
		if !isPublicIP(ip) {
			return nil, fmt.Errorf("refusing to dial unsafe address %s", host)
		}
		return safeDialer.DialContext(ctx, network, addr)
	}
	ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
	if err != nil {
		return nil, err
	}
	// Try each public record so a multi-homed host still connects if the first is down.
	var lastErr error
	for _, ip := range ips {
		if !isPublicIP(ip) {
			continue
		}
		conn, err := safeDialer.DialContext(ctx, network, net.JoinHostPort(ip.String(), port))
		if err != nil {
			lastErr = err
			continue
		}
		return conn, nil
	}
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("no safe public address for host %q", host)
}

// safeFetchClient pins every dial and re-checks every redirect target so neither rebinding nor a redirect reaches an internal host.
var safeFetchClient = &http.Client{
	Timeout:   8 * time.Second,
	Transport: &http.Transport{DialContext: safeDialContext},
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return fmt.Errorf("stopped after 10 redirects")
		}
		if !isSafeScrapeURL(req.Context(), req.URL.String()) {
			return fmt.Errorf("redirect to unsafe host blocked")
		}
		return nil
	},
}

// userFetchClient returns the SSRF-pinned client when blocking is on, else the plain shared client.
func userFetchClient() *http.Client {
	if !blockInternalHosts {
		return httpClient
	}
	return safeFetchClient
}
