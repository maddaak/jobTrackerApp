# Job Tracker

A personal job-application tracker that follows every application from **apply → recruiter
screen → interview rounds → offer/reject**, with a scheduling calendar and a funnel/metrics
view of your whole pipeline.

> 🤖 **This app has an AI feature.** Upload a resume and it gets analyzed automatically;
> from then on, adding a job produces an explicit **apply / don't-apply** recommendation
> with reasoning, picking whichever of your resumes fits best. It's powered by
> **Anthropic's Claude** — that's the only AI provider this app supports right now (see
> [Using a different Claude model](#using-a-different-claude-model) below to change which
> Claude model it calls).

Built as a **polyglot, fully containerized** system — one `docker compose up` runs the
whole thing (frontend, two backend services, a scraper, Postgres, and MongoDB) on any
machine with Docker. No local Node/Java/Go/database install required.

## What it does

- **Track every job** — company, role, source (self-applied / referral / recruiter
  outreach / etc.), stage, compensation range, and outcome, all editable inline in a
  sortable, resizable table.
- **Add a job from a URL** — paste a posting link and the scraper best-effort extracts
  company, role, location, and comp range; works with structured job-board pages (JSON-LD),
  Greenhouse-embedded career pages, and generic pages, with a manual-entry fallback when
  a site can't be read at all (e.g. it's behind a bot-challenge).
- **Interview scheduling** — a calendar view of every upcoming/past interview round, with
  interviewer names, meeting links, and location, tied back to the job it belongs to.
- **Metrics & funnel** — a Sankey-style pipeline-flow chart plus a stage-by-stage funnel
  table, so you can see where applications convert and where they stall.
- **Resume library + AI job-fit matching** *(optional)* — upload one or more resumes
  (PDF/DOCX/TXT); with an Anthropic API key configured, each resume gets a cached
  AI-generated summary, and adding a job can produce an explicit **apply / don't-apply**
  recommendation with reasoning, picking whichever resume best fits. Without a key, this
  degrades gracefully — everything else still works, you just don't get AI recommendations.
- **Job Details** — a per-job modal holding the full job description text, your own notes,
  rejection reason, and interview notes.

## Architecture

```
React + TypeScript (Vite), served over HTTPS by nginx    UI (only port exposed to the host)
        |
TypeScript BFF (Express)          the ONLY service the UI talks to; orchestrates everything below
        |------------------|
Java Spring Boot CORE         Go SCRAPER
 jobs / stages / sources /     paste a job URL -> best-effort parse of company/role/
 interviews / funnel metrics   location/comp; also owns all outbound Claude API calls
 (resume storage + text)       (resume analysis, job-fit match)
   |
Postgres (jobs, users, stages)   +   MongoDB (job description text, resume text, notes)
```

**Why polyglot (each language does what it's best at):**
- **TypeScript BFF** — the single door the UI talks to; aggregates the backend services
  and shapes responses for the frontend (Backend-for-Frontend pattern). It's also the only
  service that talks to *both* core and the scraper — core and scraper never call each other.
- **Java / Spring Boot** — the core domain: jobs, stages, sources, interviews, funnel
  metrics, and resume storage/text-extraction (PDF/DOCX/plain text).
- **Go** — a focused scraper for job postings, and the service that makes all outbound
  calls to Anthropic's Claude API (resume analysis, job-fit recommendations) — kept
  alongside the scraping code since both are "fetch something from the outside world."
- **Postgres** — structured, relational data (jobs, stages, users, sources).
- **MongoDB** — larger free-text content that doesn't need relations (job description
  text, resume text, notes), gzip-compressed at rest.

## Security between layers

This is designed with real trust boundaries, not just "make it work":
- Only the **web** container publishes a port to the host. `bff`, `core`, `scraper`,
  `postgres`, and `mongo` are reachable **only** on the internal Docker network.
- BFF → core and BFF → scraper calls carry a shared `INTERNAL_TOKEN`; both internal
  services reject any request without it.
- User accounts are multi-user with JWT auth: the BFF issues/verifies a signed JWT
  (carried in an HTTP-only cookie) on every request except `/health*` and `/auth/*`, and
  forwards the authenticated user to core so jobs/resumes stay scoped per account.
- Secrets come from a gitignored `.env`, never hardcoded or baked into images.
- The BFF validates all input, including the scrape URL (must be http/https) to prevent
  SSRF abuse of the Go fetcher.
- The browser only ever talks to nginx over HTTPS on one origin; nginx reverse-proxies
  everything else internally, so there's no cross-origin surface to defend.

## Setting it up on your machine

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or
Docker Engine + Compose), and [`mkcert`](https://github.com/FiloSottile/mkcert) for a
locally-trusted HTTPS certificate. Nothing else — Node, Go, Java, Postgres, and MongoDB
all run inside containers.

```bash
# macOS
brew install mkcert
```

### 1. Get the code

Clone or unzip this repo, then `cd` into it.

### 2. Configure secrets

```bash
cp .env.example .env
```

Open `.env` and replace every placeholder with a real value — **don't leave the
`change_me` defaults**:

```bash
# run these once, paste each result into the matching .env line
openssl rand -hex 16   # -> POSTGRES_PASSWORD
openssl rand -hex 32   # -> INTERNAL_TOKEN
openssl rand -hex 32   # -> JWT_SECRET
```

`ANTHROPIC_API_KEY` is **optional** — only needed for the AI resume-analysis and job-fit
recommendation features. Get one at [console.anthropic.com](https://console.anthropic.com)
(requires adding billing credit before real API calls work — the "evaluation" tier lets
you create a key but not call the API). Leave it blank to skip AI features entirely; the
app detects a missing key and shows a "not configured" message instead of erroring.

#### Using a different Claude model

`ANTHROPIC_MODEL` in `.env` picks which Claude model the scraper service calls for resume
analysis and job-fit matching — it defaults to `claude-sonnet-5`. To use a different Claude
model (e.g. a faster/cheaper one, or a newer one), just change that value to the model ID
you want and recreate the scraper container so it picks up the new env var:

```bash
docker compose up -d --build scraper
```

Only Anthropic/Claude models are supported right now — the scraper's AI client is written
directly against Anthropic's Messages API, not a provider-agnostic abstraction, so a
different provider (OpenAI, Gemini, etc.) isn't a config change, it would need actual code
changes to add.

### 3. Generate a local HTTPS certificate

The app is served over HTTPS (needed for things like clipboard/drag-drop APIs to behave
consistently). `certs/` is gitignored — each install generates its own:

```bash
mkcert -install                          # trusts a local CA on this machine, once
mkdir -p certs
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1
```

### 4. Build and run

```bash
docker compose up -d --build
```

First build takes a few minutes (pulls base images, compiles Java/Go, installs npm
packages). Subsequent runs are fast.

```bash
docker compose ps      # confirm all 6 containers are "Up"
```

### 5. Open it

**https://localhost:5173** — register an account (the first person to register on a
given instance creates the first user; there's no shared/default login), then log in.

> `.env` and `certs/` are both gitignored and machine-specific — each person running
> this generates their own. Data lives in Docker-managed volumes (`pgdata`, `mongodata`),
> so it persists across `docker compose restart` / rebuilds but not `docker compose down -v`.

## Troubleshooting

- **Browser says the connection isn't private** — expected on first visit if `mkcert -install`
  didn't run (or ran before Docker/your browser were open). Re-run `mkcert -install` and
  restart your browser; it's a real locally-trusted cert, not a security issue.
- **`docker compose build` fails reading `.env`** — usually a stray line that isn't valid
  `KEY=value`. Open `.env` and check for anything that doesn't look like the `.env.example` format.
- **Resume AI features show "not configured"** — either `ANTHROPIC_API_KEY` is blank, or
  the key exists but has no billing credit attached yet.
- **Port 5173 already in use** — something else is bound to it; stop that process or edit
  the `ports:` mapping for the `web` service in `docker-compose.yml`.
- **Rebuilding after pulling new code** — `docker compose up -d --build` picks up source
  changes; it won't pick up `.env` changes to already-running containers without a
  `docker compose up -d` (recreate) afterward.

## Tech stack
React · TypeScript · Node/Express · Java · Spring Boot · Go · PostgreSQL · MongoDB · Docker
· Anthropic Claude API (optional)

## License
MIT
