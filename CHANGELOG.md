# Changelog

This file is the single source of truth for what changed between released
versions. Each merge into main references the version it ships, so the commit
history stays readable and the detail lives here.

## V2.1

A hardening and bugfix release: security, error-handling, and resilience fixes, a
query and route-validation refactor, and a smarter job-fit recommendation prompt.
No new user-facing features; the one change users may notice is higher-quality AI
job-fit recommendations.

### Recommendation quality
- Reworked the job-fit recommendation prompt to separate hard requirements from
  preferred ones, honor "regardless of stack" flexibility signals so a missing
  framework is not treated as disqualifying, and produce sharper 2 to 3 sentence
  reasoning.

### Security and resilience
- Tightened the scrape SSRF guard to also reject IPv6 unspecified and loopback
  spellings, hex-group IPv4-mapped addresses, and the full fe80::/10 link-local range.
- Fixed multi-homed host dialing to fall through to later DNS records when the first
  is down, while still pinning each dial to a vetted public IP.
- Stopped the scraper AI client from retrying after a timeout (which stacked a second
  full timeout budget and pinned a worker); only fast network failures retry now.
- Added request size caps (50 resumes / resume variants) that reject oversized
  payloads with a 400 before they overflow the model context window.

### Error handling
- Core returns proper 400, 405, and 415 for missing file part, missing request
  parameter, unsupported method, and unsupported media type, instead of a generic 500.
- Corrupt gzip-stored data now surfaces as a 500 server fault rather than a 422.
- The BFF degrades a core outage during resume upload to a real 502/504 instead of 500.

### Refactor and efficiency
- Extracted route-id validation into a reusable middleware wired at the router,
  replacing duplicated per-handler id checks across jobs, interviews, and resumes.
- Consolidated the metrics queries so the furthest-stage map and interview-round
  breakdown come from a single query, and reused an already-ownership-checked job in
  the resume recommender to skip a redundant query.
- The scraper skips the full page-body text walk when JSON-LD already filled the fields.

### Web fixes
- The interview form ignores stale async responses so it no longer sets state after close.
- Memoized the metrics Sankey data so it is not rebuilt on every render.
- Removed dead code and an untyped column definition in the jobs table.

### Testing
- Added scraper tests for the model thinking-field behavior and the new payload caps.

### Continuous integration
- Added a CI workflow that runs all four test suites on every PR to main and every
  push to main, so a PR cannot merge until the tests pass.

## V2

### Metrics and pipeline visualization
- Rebuilt the pipeline chart as a custom Sankey that models the real interview
  journey (resume check, interview request, individual round types, offer, and
  outcome) instead of a generic stage funnel.
- Column order follows the actual chronology of when rounds happen, derived from
  interview timestamps.
- Active applications now flow into an "In Progress" terminal, so every path
  ends somewhere and the node totals match the real job counts.
- Each interview round has its own color (validated colorblind-safe), so a flow
  that skips a column (for example a rejection straight out of a phone screen)
  no longer looks like it stops at the round it passes behind.
- Clicking a node lists the companies at that point, with a count when a company
  appears more than once (for example "Cortex (2)").
- Visual polish: white gaps between stacked flows, single-line labels beside
  each node, and a tightened chart height.

### Jobs page
- Added full-text search across jobs.
- Added per-column filtering with search-and-checklist popovers on every column.
- Selecting the "Rejected" outcome now moves the job straight to the final stage
  and opens the details modal so the rejection reason can be captured.

### Job details
- Removed the AI recommendation call from the details modal; a recommendation is
  only produced when a job is first added, not after it is already applied to.
- The modal now shows the interview-round history and the stage history.
- The resume that was recommended when the job was added is saved and shown in
  the details.

### Interview stages and types
- Collapsed the stage model from eleven values to six clear ones (Resume Check,
  Interview Request, Interview Stage, Waiting Interview Results, Offer Stage,
  Finalized) and migrated existing data to the new stages.
- Existing rejected jobs were migrated to the Finalized stage.
- Added two interview types: Take Home Assignment and Technical Code Review.

### AI features
- When no Anthropic API key is configured, AI features are hidden across the UI
  (not just disabled) and a short disclaimer explains why.
- Added a status endpoint so the frontend knows whether AI is configured and can
  gate its UI accordingly.
- Fixed a case where an unreadable job description produced a misleading "you
  should not apply" recommendation.

### Security and configuration
- Services now fail fast on startup if required secrets (JWT secret, internal
  token) are missing, instead of running in an insecure state.
- Internal service-to-service token checks use a constant-time comparison.
- JWT verification is pinned to a fixed signing algorithm.

### Routing and infrastructure
- Fixed a bug where refreshing the browser on a client route (for example the
  metrics or resumes page) returned raw API JSON instead of the app; those
  routes now correctly serve the single-page app.
- Published pre-built multi-arch images (amd64 and arm64) to GitHub Container
  Registry on each release tag, so the app can be run from a single compose file
  with no local build.
- The web server name is now a `SERVER_NAME` startup variable, so a custom domain
  is set at run time without editing config or rebuilding the image.

### Documentation
- Documented that Anthropic Claude is the only supported AI provider and what
  happens when no key is set.
- Added a "Deploying to your own cloud" guide covering secrets, TLS, port
  mapping, and data backups.

### Testing
- Expanded test coverage, including the no-Anthropic-key path across the frontend
  and backend services.
- Added an in-memory MongoDB for the core tests so the job-delete path is verified
  without a running Mongo server (it previously hung on a connection timeout).

### Runtimes
- Updated to current runtimes: Java 25, Node 24, Go 1.25, and TypeScript 7 aligned
  across the frontend and BFF.

## V1

Initial application: a polyglot, fully containerized job-application tracker that
follows every application from apply through recruiter screen, interview rounds,
and offer or rejection.

- Track jobs with company, role, source, stage, compensation range, and outcome,
  editable inline in a sortable table.
- Add a job from a posting URL, with a best-effort scraper that extracts company,
  role, location, and compensation, and a manual-entry fallback.
- Calendar view of every interview round with interviewer names, meeting links,
  and location.
- Metrics and funnel view of the whole pipeline.
- Resume library with optional AI-generated summaries and job-fit
  recommendations, powered by Anthropic Claude.
- Per-job details holding the job description, notes, and rejection reason.
- Multi-user accounts with JWT auth, internal-token-guarded service calls, and
  HTTPS-only access through a single nginx entry point.
- One `docker compose up` runs the whole stack: React frontend, TypeScript BFF,
  Java Spring Boot core, Go scraper, Postgres, and MongoDB.
