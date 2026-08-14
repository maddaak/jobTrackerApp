# Changelog

This file is the single source of truth for what changed between released
versions. Each merge into main references the version it ships, so the commit
history stays readable and the detail lives here.

## V3.1.0

A jobs-table color and a scraper restructure. No API, schema, or data change: an upgrade is a
pull and a restart.

### Jobs table
- A job at Waiting Interview Results gets its own row color instead of the green it shared with
  every later stage. A closed outcome still wins: rejected, ghosted, or withdrawn stays red.
- The browser tab reads "Job Tracker" rather than "web".

### Scraper
- Split from three files in one `package main` into `cmd/scraper` plus `internal/httpx`,
  `internal/scrape`, `internal/ai`, and `internal/textutil`. Handlers are thin: they decode,
  validate, call a service function, and map its error. Prompt building, response parsing, and
  id coercion moved out of the HTTP layer.
- The extraction strategies (JSON-LD, Greenhouse embed, Open Graph meta) and the SSRF guard each
  live in their own file, so a filename now says what is inside it.
- Package boundaries are compiler-enforced. Only the handlers and the shared HTTP and text
  helpers are exported; the rest is package-private and unreachable from outside.
- Behavior is unchanged. Every route, status code, and response body is identical, and all 49
  existing tests moved beside the code they cover and still pass.

## V3.0.1

Four interview types added to the round dropdown: Panel - Hiring Manager Chat,
Panel - Product / XFN, Panel - Technical Demo, and Panel - Technical Deep Dive. Like every
other panel type they collapse into the single Panel node on the metrics Sankey, and each
gets its own row in the round counts. No data change; existing rounds keep their type.

## V3

A storage release. Postgres now holds only what the jobs table renders; every per-job
detail the modal shows lives on one Mongo document. The four services ship together, so
the internal API changes below need no action; the upgrade step that does is the one-way
data migration, described under Migration. Alongside it: a navigation bar, reopen-aware
metrics, and every open finding in the review ledger closed.

### Internal API changes
These are recorded for anyone reading the code or hitting core directly. Web, bff, and
core are versioned and deployed as a unit, so a normal upgrade needs nothing here.
- Interview rounds are addressed by `roundId` (a string) instead of `stageEventId` (a
  number), on `GET /interviews`, `GET /interviews/upcoming`, `PATCH /interviews/{id}`,
  `DELETE /interviews/{id}`, and the `latestInterview` block of `GET /jobs`.
- `notes` and `rejectedReason` moved off the job payload onto the job detail document.
  They are no longer accepted by `PATCH /jobs/{id}` and no longer returned by `GET /jobs`;
  read and write them through `GET`/`PUT /jobs/{id}/detail`.
- Interviewers no longer carry an `id`. They are embedded in the round that owns them.
- `interviewType` is required when creating or updating an interview, and the `stage` on
  a created interview must be one of Interview Request, Interview Stage, or Waiting
  Interview Results. Both were previously unconstrained by the API and enforced only by
  the UI.

### Storage
- Postgres is down to two tables, `jobs` and `users`. The `sources`, `stage_events`, and
  `interviewers` tables are gone.
- `sources` held a single enum in a 1:1 table with its own repository, FK, fetch-join, and
  a four-step delete dance that had leaked 10 orphan rows; it is now a column on `jobs`.
- Stage history and interview rounds, with interviewers nested inside each round, live on
  the `job_details` document keyed by `jobId`. A job has a variable number of rounds and
  each round a variable number of interviewers, which is a document rather than two tables.
- Deleting an interview no longer erases a pipeline transition. The two were the same row
  before, so removing a calendar entry silently deleted a stage-history entry.
- `job_details` gained an indexed `ownerId`, so owner-scoped reads no longer need a
  Postgres round-trip first and ownership is part of the query.
- Mongo indexes are now created explicitly at startup. `@Indexed` alone created nothing
  (Spring Data defaults `autoIndexCreation` to false), so the unique `jobId` constraint did
  not exist in a running system and every finder was a collection scan.
- `jobs.owner_id` is indexed. Every read path is owner-scoped and the foreign key to
  `users` was unindexed.

### Migration
- **Automatic, and only for an existing install on any version below v3.** Core detects a pre-v3
  database on startup and converts it, so upgrading is just `docker compose up -d`. It decides by
  looking at the schema rather than a version number, so a first install creates the v3 shape
  directly and is left untouched. Coming from v1, run `001` and `002` first if you never did.
- The conversion drops nothing: every pre-v3 column and table stays, so Postgres is the rollback
  and the old image still runs against it. If it cannot finish, core refuses to start rather than
  serving half-converted data.
- `008_drop_relational_leftovers.sql` reclaims the old tables afterwards. Destructive, so it stays
  manual and optional. `run_migration.sh` remains for converting by hand.
- `./core/migrations/run_migration.sh` backs up both stores, merges any duplicate documents,
  exports from Postgres, loads into Mongo, and verifies. It stops there: Postgres keeps every
  column and table so the old image still runs.
- `007_backfill_source_category.sql` then `008_drop_relational_leftovers.sql` finish the move.
  008 is destructive and deliberately separate: run it only after the rebuilt app is
  confirmed working.
- Nothing is deleted without being preserved first. Duplicate documents are merged with the
  loser archived; documents whose job no longer exists are archived rather than dropped.
- `GET /metrics` returns a byte-identical payload before and after the move, which is the
  equivalence check for the whole migration.

### Update notifications
- The app now tells you when a new version is out, instead of leaving you to check the repo. The
  bff asks GitHub's public tag list at most once a day, caches the answer, and the nav shows a
  link when a newer release exists.
- This is a third outbound call, so it is named in the README alongside the other two. It sends
  nothing about you or your data, and `UPDATE_CHECK=false` stops it entirely.
- It fails closed: if GitHub is unreachable or rate-limits the call, nothing is shown. A local
  build reports its version as `dev`, which no release compares against, so it stays quiet too.

### Navigation
- A persistent nav bar across Jobs, Calendar, Metrics, and Resumes, with the current page
  highlighted. Navigation was hub-and-spoke, so getting from Calendar to Metrics meant going
  home first.

### Jobs and interviews
- Saving an interview with no date or type now shows a validation error instead of silently
  discarding everything typed. A blank date was treated as cancel.
- Added the Recruiter Debrief interview type.
- A job reopened after being closed is counted from its live attempt only, so presuming a
  rejection during silence and then hearing back no longer leaves the funnel and Sankey
  reporting a stage the job has moved on from, or an outcome that was retracted.
- Deliberately stepping a job back to an earlier stage is reflected in the funnel instead of
  leaving a high-water mark above it.
- A closed outcome moving a job to Finalized is enforced in the domain, not just in a React
  change handler, so a direct API call cannot park a closed job at an earlier stage where the
  funnel still counts it as live.
- Job notes are no longer capped at 255 characters. Saving a longer note failed with a
  masked "the request conflicts with existing data".

### Reliability
- A failed load no longer renders as an authoritative empty state. "No stage history yet",
  "No interview rounds yet", an empty job picker, and a missing upcoming-interviews banner
  now say the load failed.
- A 2xx response whose body is not JSON is an error rather than an empty object handed to the
  caller, which previously surfaced as a crash far from the cause.
- The scraper reports why it found nothing (blocked host, unreachable, HTTP error, unreadable,
  or no job data) instead of returning one blank result for every failure mode, and the add-job
  form gives a specific message for each.
- Resume matching excludes a resume whose text could not be read instead of sending it to the
  model blank and returning a verdict computed partly over a resume nobody read.
- The AI handlers reject a semantically empty response. Valid-but-empty JSON previously became
  an analyzed resume with no summary, or a confident "do not apply".
- A resume whose stored analysis is unreadable is reported as unavailable rather than as
  successfully analyzed with every field blank.
- The add-job submit button is disabled while a create is in flight, so a double-click cannot
  create two jobs.

### Security and operations
- The JWT secret must be at least 64 bytes at startup in both services. A 32 to 63 byte secret
  booted cleanly and then failed every login with an unexplained 500.
- The resume analysis status is validated against the known values. A mismatched value stored
  fine and made the resume invisible to the recommender.
- core, bff, and scraper run as non-root users, and all four images have health checks.
- CI runs the TypeScript build and lint for web and bff. Neither ran before, and `vitest` does
  not typecheck, so a type error could reach main and first fail at the Docker build.

## V2.2.1

### Bug fixes
- Setting a job's outcome to Ghosted or Withdrawn now moves it to the Finalized stage,
  matching Rejected, so a closed job no longer stays stuck at an earlier stage.

### Project
- Added an MIT LICENSE file (the README already declared the project MIT-licensed).

## V2.2

### Continuous integration
- Images now auto-publish on merge to main: once CI passes on main, the version is read from
  the top of this changelog and, if that version tag does not exist yet, all four images are
  built, tagged (`<version>` and `latest`), and pushed, and the matching git tag is created.
  No manual tagging needed; a merge that does not bump the version republishes nothing.

### Code quality
- Tightened comments across all services and config to state intent only, one line each.

### Web fixes
- The pipeline Sankey renders at full width on wide screens and scrolls on narrow ones
  instead of squashing labels, and each label box is measured to hug its text so the
  counts no longer leave dead space.

### Scraper
- The remote/hybrid/onsite model is now read from the job description, so a posting with
  a structured city location plus a "hybrid" description is classified correctly instead
  of missed.

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
