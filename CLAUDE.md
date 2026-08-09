# Job Tracker: context for Claude

This file exists so Claude can help someone set this project up and answer questions about it.
README.md is the human-facing guide; prefer its steps and use this for the reasoning behind them,
the failure modes, and where things live.

## What this is

A self-hosted job-application tracker. One person runs it on their own machine or server; there is
no hosted version and no shared account. It replaces a spreadsheet of applications with a table,
an interview calendar, and pipeline metrics.

What a user can do:

- Track applications in a table: company, position (linked to the posting), how they applied,
  location, salary range, pipeline stage, and outcome.
- Record interview rounds per job, with type, time, meeting link, location, and interviewers. These
  show on a calendar and in an upcoming-interviews banner.
- See metrics: a funnel, a Sankey of the real interview journey, outcome counts, and round counts
  by type.
- Optionally, upload resumes and get AI analysis plus a job-fit recommendation when adding a job.
  This needs an Anthropic API key. Without one the feature is hidden, not broken.

## Setup

Prerequisites are Docker Desktop (running) and `mkcert`. Nothing else is installed on the host:
Node, Java, Go, Postgres, and Mongo all live in containers.

The path is: clone, copy `.env.example` to `.env` and fill the secrets, create a local certificate
with `mkcert`, then `docker compose -f docker-compose.images.yml up -d` to pull prebuilt images.
Open `https://localhost:5173` and register. The first account registered is just the first user;
there is no default login.

`.env` has one optional field. **`ANTHROPIC_API_KEY` can be left blank** and setup still
succeeds: the scraper reports the AI as unconfigured, the UI hides resume analysis and job-fit
recommendations, and everything else works. Filling it in is the only way to enable those two
features, and it costs money on the user's own Anthropic account. Do not tell someone they need
one to get started. Every other value in `.env` is required.

Things that trip people up, in the order they hit them:

- **`JWT_SECRET` must be at least 64 bytes.** Both services sign HS512 and refuse to start
  otherwise, with a message naming the actual length. `openssl rand -hex 32` produces exactly 64
  characters, which is why the README uses `32` there and `16` for the database password. Copying
  the `16` command into `JWT_SECRET` is the common mistake.
- **`mkcert -install` has to run once** before issuing the cert, or the browser distrusts it.
- **Port 5173 must be free.** Only the web container publishes a port; everything else is internal.
- **First start is slow** while images download. `docker compose ps` should eventually show all six
  services `Up`, and the four app services report a health status.
- **Data survives restarts and updates.** It lives in Docker volumes and is only destroyed by
  `docker compose down -v`. `.env` and `certs/` never leave the machine.

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
  notes, free-text notes, rejected reason, the stage history, and the interview rounds with their
  interviewers. Uploaded resumes and their AI analysis live here too.

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

## Rules for contributing to this repo

**This repo is public. The data it manages is not.** Never put anything drawn from a running
instance — application counts, company names, notes, salary figures, interview details, metrics
output — into a commit message, PR, issue, or any other public surface. Verification evidence
belongs in the conversation with whoever asked for it. Note that GitHub keeps PR and issue body
revisions, so editing something out afterwards does not remove it.

**A PR body says only `See CHANGELOG.md under <version>.`** Nothing else: no verification tables,
no test counts, no summary of the diff. One extra line is acceptable only for an upgrade warning.
CHANGELOG.md is the single source of truth for what changed, and the PR should not duplicate or
compete with it.

**Commit messages are one line, `V<version> - see CHANGELOG.md`,** matching every commit in the
history. No `Co-Authored-By`, no "Generated with" footer, no trailers of any kind.

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
cd scraper && go test ./...
docker compose up -d --build    # rebuild and run from source
```

Two conventions worth knowing before changing anything:

- **Where a new field goes is decided by one rule**: Postgres holds only what the jobs table page
  renders; Mongo holds, per job, what the details modal shows. Adding a Postgres column for
  something only the modal shows is the mistake the design exists to prevent.
- **Business rules belong in `core`'s service and model classes**, not in a React handler. A rule
  enforced only in the UI is bypassed by any direct API call.

`core/migrations/` holds numbered SQL and scripts for schema changes an ORM cannot make safely. A
fresh install never needs them. Upgrading from a pre-v3 database is automatic: `core` detects the
old shape on startup and converts it, dropping nothing, so Postgres stays the rollback. The one
step that stays manual is `008_drop_relational_leftovers.sql`, which reclaims the old tables and is
destructive. The conversion itself lives in `core/.../config/V3Migration.java`, and
`config/MongoIndexes.java` creates the Mongo indexes at startup because `@Indexed` alone builds
nothing (Spring Data defaults `autoIndexCreation` to false).

## Where things stand

v3 is the current release. Known gaps, so they are not rediscovered as if they were new:

- **Schema management is still `ddl-auto=update` plus hand-written SQL, with no Flyway.** The v3
  hop is handled by `V3Migration`, but the underlying gap remains, and it bites in a specific way:
  Hibernate cannot add a `NOT NULL` column to a populated table, so any future non-nullable column
  needs the add-nullable / backfill / constrain sequence that `007_backfill_source_category.sql`
  shows.
- **No test crosses a service boundary.** Each suite mocks its neighbours, so contract drift between
  web, bff, and core is the one class of bug the tests structurally cannot catch. Two real defects
  reached production this way before being found by review.
- **`core` has almost no logging.** `/health` reports `indexes: ready | degraded | disabled`, and
  that is close to all the runtime visibility there is. A failure elsewhere leaves only a generic
  500 as evidence.
