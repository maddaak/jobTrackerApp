# Job Tracker: context for Claude

A self-hosted job-application tracker. One person runs it on their own machine or server; there is
no hosted version and no shared account. It replaces a spreadsheet of applications with a table, an
interview calendar, and pipeline metrics.

README.md is the human-facing guide. This file is what an agent needs to set the app up, answer
questions about it, and change it.

What a user can do:

- Track applications in a table: company, position (linked to the posting), how they applied,
  location, salary range, pipeline stage, and outcome. Rows can be linked to each other.
- Record interview rounds per job, with type, time, meeting link, location, and interviewers. These
  show on a calendar and in an upcoming-interviews banner.
- Attach images to a job, and see metrics: a funnel, a Sankey of the real interview journey,
  outcome counts, and round counts by type.
- Optionally, upload resumes and get AI analysis plus a job-fit recommendation when adding a job.
  This needs an Anthropic API key. Without one the feature is hidden, not broken.

## Setting it up

Prerequisites are Docker Desktop (running) and `mkcert`. Nothing else is installed on the host:
Node, Java, Go, Postgres, and Mongo all live in containers.

**Hand these to the user instead of running them:** anything that installs software, writes to the
system trust store, or needs a secret they own: `brew install mkcert`, `mkcert -install` (it
prompts for a keychain or sudo password), and the value of `ANTHROPIC_API_KEY`.

**Never run `docker compose down -v`.** It deletes the volumes, which is the user's entire job
history. Never overwrite an existing `.env` or `certs/` either: both are gitignored, so they are
the only copy that exists.

### 0. Check whether it is already installed

```bash
docker compose ps
```

Containers already `Up` means this is an existing install, not a fresh one. Stop and ask before
changing anything: re-running setup against a live instance is how data gets lost. The `IMAGE`
column also says which path it was started on. `jobapp-*` is a local build from source,
`ghcr.io/...` is the prebuilt images. Keep using that one; starting the other replaces the running
containers with the other build.

### 1. Preflight

```bash
docker info > /dev/null 2>&1 && echo "docker running" || echo "ask the user to start Docker Desktop"
command -v mkcert > /dev/null && echo "mkcert present" || echo "ask the user to install mkcert"
lsof -i :5173 || echo "port 5173 free"
```

Port 5173 is the only published port; if something else holds it, the web container cannot bind.

### 2. Secrets

```bash
[ -f .env ] || cp .env.example .env
openssl rand -hex 16   # -> POSTGRES_PASSWORD
openssl rand -hex 32   # -> INTERNAL_TOKEN
openssl rand -hex 32   # -> JWT_SECRET
```

Each value replaces the matching `change_me` placeholder in `.env`. `.env` is gitignored, so it is
also the only copy: write to it, never over it. (No `openssl` on the host:
`docker run --rm alpine/openssl rand -hex 32`.)

**`JWT_SECRET` must be at least 64 bytes.** `openssl rand -hex 32` produces exactly 64 characters,
which is why the length differs from the database password's `-hex 16`. Copying the `16` command
into `JWT_SECRET` is the mistake that keeps happening: both `bff` and `core` sign HS512 and refuse
to start under 64 bytes, with a message naming the length they found.

Required, and the app will not start without them: `POSTGRES_DB`, `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `MONGO_INITDB_DATABASE`, `INTERNAL_TOKEN`, `JWT_SECRET`, `JWT_EXPIRY_DAYS`.
`.env.example` already carries working values for all but the three secrets above.

Optional, each with a working default: `ANTHROPIC_API_KEY` (blank disables the AI features),
`ANTHROPIC_MODEL` (`claude-sonnet-5`), `UPDATE_CHECK` (`true`), `SERVER_NAME` (`localhost`),
`IMAGE_TAG` (`latest`), `IMAGE_PREFIX` (`ghcr.io/maddaak`).

**Do not tell someone they need an Anthropic key to get started.** Without it the scraper reports
the AI as unconfigured, the UI hides resume analysis and job-fit recommendations, and everything
else works. Filling it in is the only way to enable those two features, and it costs money on the
user's own Anthropic account.

### 3. Certificate

The user runs this once; it writes to the system trust store:

```bash
mkcert -install
```

Then the cert itself, which is safe for an agent to run:

```bash
mkdir -p certs
mkcert -cert-file certs/localhost.pem -key-file certs/localhost-key.pem localhost 127.0.0.1 ::1
```

Skipping `mkcert -install` is what makes the browser distrust an otherwise correct cert.

### 4. Start

```bash
docker compose -f docker-compose.images.yml up -d   # prebuilt images: the default
docker compose up -d --build                        # from source: only when changing the code
```

Default to the images path. Use the source path only if the user is working on the code; note it
builds four services and takes minutes. First start is slow either way while images download.

### 5. Verify

```bash
docker compose ps
curl -sk https://localhost:5173/health      # {"status":"ok","service":"bff"}
curl -sk https://localhost:5173/ai-status   # {"aiConfigured":true} only when a key is set
```

All six services should be `Up`, and `web`, `bff`, `core`, and `scraper` should report a health
status. Then tell the user to open `https://localhost:5173` and register: the first account is
simply the first user, and there is no default login.

Data survives restarts and updates. It lives in Docker volumes; `.env` and `certs/` never leave
the machine.

### Updating

`up -d` alone does not pull a newer image. Compose reuses whatever it already has, so someone on
the images path who says "I updated and nothing changed" almost certainly skipped the pull:

```bash
docker compose -f docker-compose.images.yml pull
docker compose -f docker-compose.images.yml up -d
```

Each release publishes both a `<version>` and a `latest` tag. `IMAGE_TAG` defaults to `latest`;
setting `IMAGE_TAG=v3.2.0` in `.env` pins the version, after which `pull` fetches nothing new until
that pin moves. Running from source instead uses `git pull && docker compose up -d --build`, which
builds locally and never touches the registry.

## What runs where

Six containers. A browser only ever talks to `web`.

- `web`: nginx serving the React app and proxying API paths to `bff`. The only published port.
- `bff`: Express. The only service that talks to `core` and `scraper`. Holds the session cookie,
  verifies the JWT, and adds an internal token on every upstream call.
- `core`: Spring Boot. Owns the data and all business rules.
- `scraper`: Go. Fetches a job posting from a URL and calls Anthropic for the AI features.
- `postgres` and `mongo`: storage.

Where a user's data actually is, which is the most common question:

- **Postgres** holds the accounts and the job rows behind the table page: company, role, posting
  URL, how they applied, location, salary range, stage, and outcome.
- **Mongo** holds, per job, everything the details modal shows: the job description text, interview
  notes, free-text notes, rejected reason, the stage history, the interview rounds with their
  interviewers, and the linked-job edges. Image attachments and uploaded resumes live here too, in
  their own collections.

## When something is wrong

- **A service is `unhealthy` or restarting.** `docker compose logs <service>` names the cause.
  Every service is set to restart unless stopped, so a transient failure recovers on its own.
- **`core` exits at startup.** Almost always a bad `.env`: a `JWT_SECRET` under 64 bytes or a
  missing `INTERNAL_TOKEN`. Both fail loudly with a message rather than starting broken.
- **Browser warns about the certificate.** `mkcert -install` was skipped, or the cert was issued
  for a different hostname than the one being opened.
- **AI features are missing rather than failing.** That is deliberate: no `ANTHROPIC_API_KEY` means
  they are hidden. Add the key and restart to enable them.
- **A saved change does not appear.** Check `bff` logs first; it reports the status `core` returned.
- **A browser hitting an API path gets a blank page.** nginx rewrites to the SPA on
  `Accept: text/html`, so any path a browser navigates to directly needs its own `location` above
  that rule in `web/nginx.conf.template`. curl never reproduces it.

## Rules for contributing to this repo

**This repo is public. The data it manages is not.** Never put anything drawn from a running
instance (application counts, company names, notes, salary figures, interview details, metrics
output) into a commit message, PR, issue, or any other public surface. Verification evidence
belongs in the conversation with whoever asked for it. Note that GitHub keeps PR and issue body
revisions, so editing something out afterwards does not remove it.

**A PR body says only `See CHANGELOG.md under <version>.`** Nothing else: no verification tables,
no test counts, no summary of the diff. One extra line is acceptable only for an upgrade warning.
CHANGELOG.md is the single source of truth for what changed, and the PR should not duplicate or
compete with it.

**Commit messages are one line, `V<version> - see CHANGELOG.md`,** matching every commit in the
history. No `Co-Authored-By`, no "Generated with" footer, no trailers of any kind. A release branch
is squashed to that one commit.

**Merging to main publishes.** CI success on main triggers the image workflow, which reads the
version from the top of CHANGELOG.md and, if that tag does not exist yet, builds and pushes all four
images as `<version>` and `latest` and creates the git tag. So the changelog's top heading decides
what ships, and a merge that does not bump it republishes nothing.

## Working on the code

Only needed if the user wants to modify it. Build and test each service:

```bash
cd core && ./mvnw test          # Spring Boot; needs JDK 25 on PATH or via JAVA_HOME
cd bff  && npm run build && npm test
cd web  && npm run build && npm run lint && npx vitest run
cd scraper && go test ./... && go vet ./...
docker compose up -d --build    # rebuild and run from source
```

Three conventions worth knowing before changing anything:

- **Where a new field goes is decided by one rule**: Postgres holds only what the jobs table page
  renders; Mongo holds, per job, what the details modal shows. Adding a Postgres column for
  something only the modal shows is the mistake the design exists to prevent.
- **Business rules belong in `core`'s service and model classes**, not in a React handler. A rule
  enforced only in the UI is bypassed by any direct API call.
- **A new BFF route prefix must be added to `web/nginx.conf.template`'s allowlist regex**, or it
  405s through the real proxy while every test still passes.
- **A new interview type touches five places**, and nothing fails if one is missed: the enum in
  `core/.../model/InterviewType.java`, the union in `bff/.../interviewsClient.ts`, the union +
  `INTERVIEW_TYPES` + `INTERVIEW_TYPE_LABELS` in `web/src/api/interviewsApi.ts`,
  `ROUND_NODE_ORDER` in `MetricsService` (its Sankey position when no job has ordered it yet), and
  `INTERVIEW_ROUND_COLORS` in `MetricsPage.tsx` (without it the node renders in the fallback grey,
  the same grey as In Progress). A `PANEL_` prefix is what collapses a type into the single Panel
  node on the Sankey.

`core/migrations/` holds numbered SQL and scripts for schema changes an ORM cannot make safely. A
fresh install never needs them. Upgrading from a pre-v3 database is automatic: `core` detects the
old shape on startup and converts it, dropping nothing, so Postgres stays the rollback. The one
step that stays manual is `008_drop_relational_leftovers.sql`, which reclaims the old tables and is
destructive. The conversion lives in `core/.../config/V3Migration.java`; `config/MongoIndexes.java`
creates the Mongo indexes at startup because `@Indexed` alone builds nothing; and
`config/EnumCheckConstraints.java` rewrites each enum column's CHECK constraint from the Java enum,
because `ddl-auto=update` never widens one Hibernate wrote earlier.

## Where things stand

v3.2.0 is the current release. Known gaps, so they are not rediscovered as if they were new:

- **Schema management is still `ddl-auto=update` plus hand-written SQL, with no Flyway.** The v3
  hop is handled by `V3Migration`, but the underlying gap remains, and it bites in a specific way:
  Hibernate cannot add a `NOT NULL` column to a populated table, so any future non-nullable column
  needs the add-nullable / backfill / constrain sequence that `007_backfill_source_category.sql`
  shows.
- **No test crosses a service boundary.** Each suite mocks its neighbours, so contract drift between
  web, bff, and core is the one class of bug the tests structurally cannot catch. Three real defects
  reached production this way before being found by review.
- **`core` has almost no logging.** `/health` reports `indexes: ready | degraded | disabled`, and
  that is close to all the runtime visibility there is. A failure elsewhere leaves only a generic
  500 as evidence.
