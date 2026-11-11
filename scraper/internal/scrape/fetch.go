package scrape

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

var httpClient = &http.Client{Timeout: 8 * time.Second}

// SSRF guard on the user URL; a package var so tests can disable it for 127.0.0.1 fixtures.
var blockInternalHosts = true

// Never-dial ranges Go's net.IP predicates miss: CGNAT, reserved, TEST-NET-1, benchmarking, "this network".
var blockedIPNets = func() []*net.IPNet {
	nets := make([]*net.IPNet, 0, 5)
	for _, cidr := range []string{
		"100.64.0.0/10",
		"240.0.0.0/4",
		"192.0.2.0/24",
		"198.18.0.0/15",
		"0.0.0.0/8",
	} {
		_, n, err := net.ParseCIDR(cidr)
		if err != nil {
			panic(fmt.Sprintf("invalid blocked CIDR %q: %v", cidr, err))
		}
		nets = append(nets, n)
	}
	return nets
}()

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

// Every resolved IP must be public, so a host with one internal record among public ones is refused.
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
	// No real top-level domain is numeric, so this is an IP spelling ParseIP won't read (octal, hex, short),
	// which resolvers disagree on: macOS reads 0177.0.0.1 as 177.0.0.1, Linux refuses it.
	if _, err := strconv.ParseUint(host[strings.LastIndex(host, ".")+1:], 0, 64); err == nil {
		return false
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

// Wrapped by every refusal past the first check, so a redirect or rebind reports blocked_host, not unreachable.
var errUnsafeHost = errors.New("refusing to reach an internal address")

// Dial only vetted public IPs so DNS rebinding can't slip a private IP past the pre-check.
func safeDialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	if ip := net.ParseIP(host); ip != nil {
		if !isPublicIP(ip) {
			return nil, fmt.Errorf("%w: %s", errUnsafeHost, host)
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
	return nil, fmt.Errorf("%w: no public address for %q", errUnsafeHost, host)
}

// Pins every dial and re-checks every redirect target, so neither rebinding nor a redirect reaches an
// internal host.
var safeFetchClient = &http.Client{
	Timeout:   8 * time.Second,
	Transport: &http.Transport{DialContext: safeDialContext},
	CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 10 {
			return fmt.Errorf("stopped after 10 redirects")
		}
		if !isSafeScrapeURL(req.Context(), req.URL.String()) {
			return fmt.Errorf("%w: redirect to %s", errUnsafeHost, req.URL.Hostname())
		}
		return nil
	},
}

func userFetchClient() *http.Client {
	if !blockInternalHosts {
		return httpClient
	}
	return safeFetchClient
}
