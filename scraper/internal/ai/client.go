// Package ai calls the configured AI provider and builds the resume and offer features on it.
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"strings"
	"time"

	"jobtracker/scraper/internal/httpx"
	"jobtracker/scraper/internal/textutil"
)

// Go resends custom headers on a redirect, so following one would hand the API key to wherever it points.
var aiHTTPClient = &http.Client{
	CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse },
}

// The whole call, every attempt included: long enough for a full comparison of several offers, and short
// of the bff's 120s, so the answer always gets back to someone still waiting for it.
var callBudget = 100 * time.Second

var errNotConfigured = errors.New("no AI provider configured")

// errBadResponse marks a call that succeeded but came back unusable, so the caller answers 502 rather than 503.
var errBadResponse = errors.New("unusable response from the AI provider")

const maxPromptChars = 12000

const maxRetries = 2

var retryBackoffBase = 500 * time.Millisecond

// Statuses a provider sends before doing any work, so asking again can't pay twice: rate limited,
// unavailable, and Anthropic's overloaded. A 500 or a gateway error can arrive after the work is done.
var turnedAway = map[int]bool{http.StatusTooManyRequests: true, http.StatusServiceUnavailable: true, 529: true}

func complete(ctx context.Context, systemPrompt, userMessage string, maxTokens int) (string, error) {
	p, err := configuredProvider()
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(ctx, callBudget)
	defer cancel()
	respBody, err := post(ctx, p, p.spec.protocol.request(p, systemPrompt, userMessage, maxTokens))
	if err != nil {
		return "", err
	}
	return p.spec.protocol.answer(respBody)
}

// post retries only a request the provider never worked on, so it costs at most one billed answer; the
// caller's context carries the time budget every attempt shares.
func post(ctx context.Context, p provider, request any) ([]byte, error) {
	body, err := json.Marshal(request)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}
	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			select {
			case <-time.After(time.Duration(attempt) * retryBackoffBase):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}
		respBody, retryable, err := sendOnce(ctx, p, body)
		if err == nil {
			return respBody, nil
		}
		lastErr = err
		if !retryable {
			return nil, err
		}
	}
	return nil, lastErr
}

// sendOnce makes one attempt; the bool reports whether the provider turned it away unworked.
func sendOnce(ctx context.Context, p provider, body []byte) ([]byte, bool, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+p.spec.protocol.path, bytes.NewReader(body))
	if err != nil {
		return nil, false, fmt.Errorf("build request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	for name, value := range p.spec.protocol.headers(p.apiKey) {
		httpReq.Header.Set(name, value)
	}

	resp, err := aiHTTPClient.Do(httpReq)
	if err != nil {
		// Only a connection that was never made is safe to try again: a reset or a timeout can land
		// after the provider has done, and billed, the work.
		var opErr *net.OpError
		neverConnected := errors.As(err, &opErr) && opErr.Op == "dial"
		return nil, neverConnected, fmt.Errorf("call %s: %w", p.baseURL, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, httpx.MaxBodyBytes))
	if resp.StatusCode != http.StatusOK {
		return nil, turnedAway[resp.StatusCode], fmt.Errorf("%s returned status %d: %s", p.baseURL, resp.StatusCode, textutil.Truncate(string(respBody), 2000))
	}
	if err != nil {
		// The call succeeded and was billed; asking again would pay twice.
		return nil, false, fmt.Errorf("read answer: %w", err)
	}
	return respBody, false, nil
}

// ask returns the raw text too, so the caller's own checks can log what the model actually said.
func ask(ctx context.Context, label, systemPrompt, userMessage string, maxTokens int, out any) (string, error) {
	raw, err := complete(ctx, systemPrompt, userMessage, maxTokens)
	if err != nil {
		return "", err
	}
	return raw, decodeObject(label, raw, out)
}

// Starting at the first brace skips a fence or preamble; the decoder stops at the object's end, so
// trailing prose with braces of its own can't break the parse.
func decodeObject(label, raw string, out any) error {
	start := strings.Index(raw, "{")
	if start < 0 {
		start = len(raw)
	}
	if err := json.NewDecoder(strings.NewReader(raw[start:])).Decode(out); err != nil {
		log.Printf("%s: answer was not a JSON object: %v; raw response: %s", label, err, textutil.Truncate(raw, 2000))
		return errBadResponse
	}
	return nil
}
