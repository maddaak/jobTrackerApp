# Job Tracker

A personal job-application tracker that follows every application from **apply → recruiter
screen → interview rounds → offer/reject**, with an interview calendar and a funnel/metrics
view of your whole pipeline.

> 🤖 **This app has an AI feature.** Upload a resume and it gets analyzed automatically;
> from then on, adding a job produces an explicit **apply / don't-apply** recommendation
> with reasoning, picking whichever of your resumes fits best. It's powered by
> **Anthropic's Claude** - that's the only AI provider this app supports right now (see
> [Using a different Claude model](#using-a-different-claude-model) below to change which
> Claude model it calls).

> ⚠️ **This app does not apply to jobs for you.** It is a personal tracker for applications
> you submit yourself. It never sends applications, contacts employers, or takes any action on
> a posting on your behalf. Its only outside calls are reading a posting URL you paste (to
> pre-fill fields), optionally asking Claude to summarize a resume or suggest which of your
> resumes best fits a posting, and a once-a-day check of this repo's public tag list to tell you
> when a new version is out (`UPDATE_CHECK=false` turns that off; it sends nothing about you).
> The apply / don't-apply output is a suggestion for you to read, nothing more.

Built as a **polyglot, fully containerized** system - one `docker compose up` runs the
whole thing (frontend, two backend services, a scraper, Postgres, and MongoDB) on any
machine with Docker. No local Node/Java/Go/database install required.

## Contents

- [What it does](#what-it-does)
- [Quick start](#quick-start)
- [Architecture](#architecture)
- [Security between layers](#security-between-layers)
- [Configuration](#configuration)
- [Windows](#windows)
- [Deploying to your own cloud](#deploying-to-your-own-cloud)
- [Troubleshooting](#troubleshooting)
- [Tech stack](#tech-stack)
- [Changelog](#changelog)
- [License](#license)

## What it does

- **Track every job** - company, role, source (self-applied / referral / recruiter
  outreach / etc.), stage, compensation range, and outcome, all editable inline in a
  sortable, resizable table.
- **Add a job from a URL** - paste a posting link and the scraper best-effort extracts
  company, role, location, and comp range; works with structured job-board pages (JSON-LD),
  Greenhouse-embedded career pages, and generic pages, with a manual-entry fallback when
  a site can't be read at all (e.g. it's behind a bot-challenge).
- **Interview calendar** - a calendar view of the interview rounds you log yourself, with
  interviewer names, meeting links, and location, tied back to the job it belongs to. You
  enter the details; it does not book or schedule anything for you.
- **Metrics & funnel** - a Sankey-style pipeline-flow chart plus a stage-by-stage funnel
  table, so you can see where applications convert and where they stall.
- **Resume library + AI job-fit matching** *(optional)* - upload one or more resumes
  (PDF/DOCX/TXT); with an Anthropic API key configured, each resume gets a cached
  AI-generated summary, and adding a job can produce an explicit **apply / don't-apply**
  recommendation with reasoning, picking whichever resume best fits. Without a key, the AI
  features are hidden across the UI, with a short disclaimer that no Anthropic key is
  configured; everything else still works.
- **Job Details** - a per-job modal holding the full job description text, your own notes,
  rejection reason, interview notes, the job's stage history, and its interview rounds.

## Quick start

Everything runs in **Docker**, so you don't install Node, Java, Go, or the databases yourself -
Docker pulls and runs all six pieces for you. You need two things installed first:

- **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** - runs the app's
  containers. Make sure it's installed and running before you start.
- **[`mkcert`](https://github.com/FiloSottile/mkcert)** - issues a locally-trusted certificate so
  your browser doesn't warn on `https://localhost`:

```bash
brew install mkcert                # macOS
choco install mkcert               # Windows (or: scoop install mkcert)
sudo apt install libnss3-tools     # Linux (Debian/Ubuntu), then install mkcert from your package
                                   # manager or github.com/FiloSottile/mkcert/releases
```

**1. Get the code.**

```bash
git clone https://github.com/maddaak/jobTrackerApp.git && cd jobTrackerApp
```

If you only want to *run* the app and would rather skip git, download just
[`docker-compose.images.yml`](https://github.com/maddaak/jobTrackerApp/blob/main/docker-compose.images.yml)
and [`.env.example`](https://github.com/maddaak/jobTrackerApp/blob/main/.env.example) from the repo into a
new folder instead (then use the pre-built-images option in [step 4](#step-4); building from source
needs the full checkout).

**2. Set your secrets.** Copy `.env.example` to `.env` - it holds the app's passwords and keys and
never leaves your machine. Each command prints a random value; paste it into the matching line:

```bash
docker run --rm alpine/openssl rand -hex 16   # -> POSTGRES_PASSWORD
docker run --rm alpine/openssl rand -hex 32   # -> INTERNAL_TOKEN
docker run --rm alpine/openssl rand -hex 32   # -> JWT_SECRET
```

`ANTHROPIC_API_KEY` is optional; it enables the AI resume analysis and job-fit suggestions. Leave
it blank and those features are hidden, everything else works. See [Configuration](#configuration).

**3. Create a local HTTPS certificate.** The app is served over HTTPS even locally, so it needs a
cert your browser trusts:

```bash
mkcert -install     # installs a local certificate authority, once
mkdir certs
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1
```

<a id="step-4"></a>
**4. Start it.** Pick one:

```bash
# Recommended: pull the pre-built images, nothing to compile
docker compose -f docker-compose.images.yml up -d

# Or build from source (for development)
docker compose up -d --build
```

First start takes a few minutes while Docker downloads everything; then `docker compose ps` should
show all six services "Up".

**5. Open [https://localhost:5173](https://localhost:5173)** and register. The first account
created on an instance becomes the first user; there's no shared or default login.

> Your data is saved by Docker and survives restarts and updates. It is only deleted if you run
> `docker compose down -v`. Your `.env` and `certs/` files stay on your machine and are never
> uploaded or shared.

## Architecture

```
React + TypeScript (Vite), served over HTTPS by nginx    UI (only port exposed to the host)
        |
TypeScript BFF (Express)          the ONLY service the UI talks to; orchestrates everything below
        |------------------|
Java Spring Boot CORE         Go SCRAPER
 jobs / interviews /           paste a job URL -> best-effort parse of company/role/
 stage history / metrics       location/comp; also owns all outbound Claude API calls
 (resume storage + text)       (resume analysis, job-fit match)
   |
Postgres (users + the job rows the table page shows)
MongoDB  (per job: everything the details modal shows, plus resumes)
```

**Why polyglot (each language does what it's best at):**
- **TypeScript BFF** - the single door the UI talks to; aggregates the backend services
  and shapes responses for the frontend (Backend-for-Frontend pattern). It's also the only
  service that talks to *both* core and the scraper - core and scraper never call each other.
- **Java / Spring Boot** - the core domain: jobs, interviews, stage history, funnel
  metrics, and resume storage/text-extraction (PDF/DOCX/plain text).
- **Go** - a focused scraper for job postings, and the service that makes all outbound
  calls to Anthropic's Claude API (resume analysis, job-fit recommendations) - kept
  alongside the scraping code since both are "fetch something from the outside world."
- **Postgres** - accounts, and exactly the job columns the table page renders and
  filters on: company, role, posting URL, how you applied, location, comp range, stage,
  and outcome. Two tables, `jobs` and `users`.
- **MongoDB** - everything the job details modal shows, as one document per job: the job
  description text, your notes, rejected reason, the stage history, and the interview
  rounds with their interviewers nested inside each round. Resumes and their AI analysis
  live here too. Large text is gzip-compressed at rest.

  The split is deliberate: a job has a variable number of interview rounds and each round
  a variable number of interviewers, which is a document rather than three joined tables.
  Anything the table page has to sort or filter on stays relational.

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

## Configuration

### AI features (optional)

`ANTHROPIC_API_KEY` in `.env` enables resume analysis and job-fit recommendations, powered by
Anthropic's Claude. Get one at [console.anthropic.com](https://console.anthropic.com) (real calls
need billing credit; the "evaluation" tier can create a key but not call the API). Leave it blank
to run without AI: the app hides those features and shows a short "no Anthropic key configured"
note instead of erroring.

### Using a different Claude model

`ANTHROPIC_MODEL` picks which Claude model the scraper calls (default `claude-sonnet-5`). Change
it and recreate the scraper so it picks up the new value:

```bash
docker compose up -d --build scraper
```

Only Anthropic/Claude models are supported - the scraper's AI client is written directly against
Anthropic's Messages API, not a provider-agnostic abstraction, so a different provider (OpenAI,
Gemini, etc.) would need actual code changes, not just config.

### Running a specific image version

`docker-compose.images.yml` uses `IMAGE_PREFIX` (default `ghcr.io/maddaak`) and `IMAGE_TAG`
(default `latest`), both overridable in `.env` to pin a version or run your own fork's images:

```bash
IMAGE_TAG=v3
```

To publish images from your own fork, push a version tag (`git tag v3 && git push origin v3`); the
`publish-images` workflow builds each service for amd64 and arm64 and pushes them to GitHub
Container Registry. The first time, make the resulting packages public in your GitHub Packages
settings so others can pull them without authenticating.

## Windows

The app runs on Windows the same way: everything is in Linux containers, and the images are
built for both amd64 and arm64, so a normal Windows laptop runs the amd64 image. The setup
commands above are cross-platform (Docker, `mkcert`, `git`), so they work as written. Two
Windows-only notes:

- Use **Docker Desktop with the WSL2 backend** (its default).
- Save `.env` with **"LF" line endings, not "CRLF"**. Line endings are the invisible character
  an editor adds at the end of each line, and Windows editors often default to "CRLF", which can
  glue a hidden character onto your secrets and break login. If you use VS Code, click the
  **CRLF** button in the bottom-right corner and switch it to **LF** before saving (most editors
  have a similar option). If you are not sure, editing `.env` inside the WSL2 terminal (with
  `nano` or `vim`) avoids the issue entirely.

## Deploying to your own cloud

The whole app is one `docker-compose.yml` (six containers: the `web` nginx plus the `bff`,
`core`, and `scraper` services, and `postgres` + `mongo`). Anywhere you can run Docker and
the Docker Compose plugin (a VM, a small managed instance, etc.) can run it. This is a
single-node setup, not a horizontally-scaled one.

### Prerequisites
- A Linux host with Docker Engine and the Docker Compose plugin.
- A domain with a DNS A record pointing at the host's public IP.
- Inbound TCP 443 open to the host.

### 1. Get the code and configure secrets

```bash
git clone https://github.com/maddaak/jobTrackerApp.git
cd jobTrackerApp
```

Copy `.env.example` to a new file named `.env`, then fill it with strong, unique values (do
not ship the `change_me` placeholders):

```bash
docker run --rm alpine/openssl rand -base64 32   # use for INTERNAL_TOKEN
docker run --rm alpine/openssl rand -base64 48   # use for JWT_SECRET
```

Set `POSTGRES_PASSWORD` to a strong password, and `ANTHROPIC_API_KEY` if you want the AI
features (leave it blank to run without them). `.env` is gitignored and never committed.

### 2. TLS certificate

The `web` container's nginx serves HTTPS and reads the cert from `certs/localhost.pem` and
`certs/localhost-key.pem`. For a real domain, drop your real certificate in with those same
filenames (so no nginx edit is needed) and set your domain as the server name:

- Get a cert for your domain, e.g. Let's Encrypt: `certbot certonly --standalone -d your.domain`,
  then copy `fullchain.pem` to `certs/localhost.pem` and `privkey.pem` to `certs/localhost-key.pem`.
- Set `SERVER_NAME=your.domain` in `.env`. It is passed to the `web` container at startup, so no
  rebuild or config edit is needed (defaults to `localhost`).

`certs/` is gitignored, so it stays on the host only. If your cloud already terminates TLS at
a load balancer or ingress, skip the cert entirely: point the load balancer at the `web`
container and have the nginx listen on plain HTTP (change its `listen 443 ssl;` to `listen 80;`
and drop the `ssl_certificate*` lines).

### 3. Expose port 443

In `docker-compose.yml` the `web` service maps `5173:443` for local use. On a server, map the
standard HTTPS port instead:

```yaml
  web:
    ports:
      - "443:443"
```

### 4. Build and run

```bash
docker compose up -d --build
docker compose ps        # all six containers should be "Up"
```

Open `https://your.domain` and register the first account.

### 5. Data, backups, updates

- Postgres and Mongo data live in the `pgdata` / `mongodata` Docker volumes (named
  `jobapp_pgdata` / `jobapp_mongodata`). They survive restarts and rebuilds, but
  `docker compose down -v` deletes them. Back them up, for example:
  `docker run --rm -v jobapp_pgdata:/data -v "$PWD":/backup alpine tar czf /backup/pg.tgz /data`.
- To update: `git pull && docker compose up -d --build`.
- **Upgrading to v3 from any earlier version converts your data automatically.** v3 moved the
  interview and stage data out of Postgres; core detects a pre-v3 database on startup and converts
  it, so `docker compose up -d` is the whole upgrade. It decides by looking at the schema, not a
  version number, and a fresh install is left alone. Back up first anyway (see above) — the
  conversion drops nothing, so Postgres keeps every old column and table as the rollback, and if it
  cannot finish it refuses to start rather than half-running.
- Once v3 is confirmed working you can reclaim the old tables with
  `core/migrations/008_drop_relational_leftovers.sql`. That step is destructive, so it stays manual
  and is entirely optional. `run_migration.sh` remains for converting by hand if you prefer.
- Only the `web` container is meant to face the internet. Everything else (bff, core,
  scraper, and both databases) stays on the private Docker network.

## Troubleshooting

- **Browser says the connection isn't private** - expected on first visit if `mkcert -install`
  didn't run (or ran before Docker/your browser were open). Re-run `mkcert -install` and
  restart your browser; it's a real locally-trusted cert, not a security issue.
- **`docker compose build` fails reading `.env`** - usually a stray line that isn't valid
  `KEY=value`. Open `.env` and check for anything that doesn't look like the `.env.example` format.
- **`core` won't start / exits immediately** - check `docker compose logs core`. The usual cause is
  a `JWT_SECRET` shorter than 64 bytes, which HS512 signing requires; the log names the length it
  found. `openssl rand -hex 32` gives exactly 64 characters, so use that command, not the `-hex 16`
  one used for the database password.
- **A service shows `unhealthy` in `docker compose ps`** - every service has a health check and
  restarts unless you stopped it, so a transient failure recovers on its own. If it stays
  unhealthy, `docker compose logs <service>` says why.
- **AI features are hidden / show a "no Anthropic key" disclaimer.** `ANTHROPIC_API_KEY` is
  blank; set it and restart to enable them. If the key is set but AI calls still fail, the
  key likely has no billing credit attached yet.
- **Port 5173 already in use** - something else is bound to it; stop that process or edit
  the `ports:` mapping for the `web` service in `docker-compose.yml`.
- **Rebuilding after pulling new code** - `docker compose up -d --build` picks up source
  changes; it won't pick up `.env` changes to already-running containers without a
  `docker compose up -d` (recreate) afterward.

## Tech stack
React · TypeScript · Node/Express · Java · Spring Boot · Go · PostgreSQL · MongoDB · Docker
· Anthropic Claude API (optional)

## Changelog
See [CHANGELOG.md](CHANGELOG.md) for what changed between versions.

## License
MIT
