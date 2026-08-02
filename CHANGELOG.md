# Changelog

This file is the single source of truth for what changed between released
versions. Each merge into main references the version it ships, so the commit
history stays readable and the detail lives here.

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
