# Job Tracker: context for coding agents

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
- Optionally, upload resumes and get AI analysis, a job-fit recommendation when adding a job, and an
  AI comparison of offers. Also company briefs, interview prep per kind of round, debriefs, follow-up and
  counter-offer drafts, resume tailoring, and Insights patterns. Each runs only on a button press and
  its answer is saved. (Title, location, and pay from a pasted description need no AI.) This needs an AI provider:
  Anthropic, any OpenAI-compatible API, or a local model server. Without one these features are
  hidden, not broken.

## Setting it up

The only prerequisite is Docker Desktop (running). `mkcert` is optional: with no certificate in
`certs/`, nginx serves plain `http://localhost:5173`, which browsers treat as secure on the same
machine. Nothing else is installed on the host: Node, Java, Go, Postgres, and Mongo all live in
containers.

**Hand these to the user instead of running them:** anything that installs software, writes to the
system trust store, or needs a secret they own: `brew install mkcert`, `mkcert -install` (it
prompts for a keychain or sudo password), and the value of `AI_API_KEY`.

**Never run `docker compose down -v`.** It deletes the volumes, which is the user's entire job
history. Never overwrite an existing `.env` or `certs/` either: both are gitignored, so they are
the only copy that exists.

**Keep the user's secrets and data out of the conversation.** Everything an agent reads or runs goes to
its own AI provider, and the app's promise is that the user's data stays on their machine. Never print
`.env` or a value from it: re-running `sh setup.sh` says which secrets are set without showing them.
Never query the databases, read a backup file, or call the API for their jobs. Never ask the user to
paste a key or password into the conversation (`AI_API_KEY`, `SMTP_PASSWORD`): tell them to open `.env`
in an editor and paste it there. Say what a command does before running it: `sh setup.sh` writes random
secrets into `.env` locally and makes no network calls, and `docker compose` downloads public images
and starts containers on this machine. `.claude/settings.json` enforces the worst of this for Claude Code,
refusing reads of `.env`, `certs/`, and backups, and the commands that print the environment. Other tools
have only these rules as the guard, so follow them whatever your tool allows. Asked whether their
data leaves the machine, point to the README's "Your data stays on your machine".

**Handle these with care: never read, print, copy, move, edit, or delete them** unless the user asks
for that exact action on that exact file. Each is the only copy, or holds secrets or real job data:

- `.env`: every password, key, and token the app runs on. Change one setting with the `sed` line in
  step 1, which never shows the file.
- `certs/`: the https certificate and its private key.
- Backups: `job-tracker-backup*.json`, `jobtracker-postgres.sql`, `jobtracker-mongo.archive`, and
  `core/migrations/backups/`. Each is a full copy of the user's job search.
- The Docker volumes, which hold the databases: no `down -v`, `volume rm`, or `system prune --volumes`.

None of these is in git, so a mistake can't be undone from it.

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
command -v mkcert > /dev/null && echo "mkcert present: https" || echo "no mkcert: plain http, which is fine"
lsof -i :5173 || echo "port 5173 free"
```

Port 5173 is the only published port; if something else holds it (a Vite dev server often does), set
`WEB_PORT` in `.env` to a free one and use that port wherever this file says 5173. Change one setting
without opening the file, so no secret is shown: `sed -i.bak 's/^WEB_PORT=.*/WEB_PORT=5174/' .env && rm .env.bak`.

On Windows, `.gitattributes` keeps every file LF, so a clone works as is. With no `sh` (no Git Bash or
WSL), Docker runs the setup script: `docker run --rm -v "${PWD}:/app" -w /app alpine sh setup.sh`. A
`.env` edited by hand must stay LF too; CRLF puts a hidden character on every secret and breaks login.

### 2. Secrets

`sh setup.sh` does this whole step and the certificate in step 3: it makes `.env` from
`.env.example`, replaces only values still on a `change_me` placeholder (the database password only
when it made `.env` itself, since Postgres keeps the one it was first started with), and runs mkcert
if it's installed. It is safe to run against an existing install. Use it rather than the steps below,
which print each secret: those are for the user to run themselves, never an agent.

```bash
[ -f .env ] || cp .env.example .env
openssl rand -hex 16   # -> POSTGRES_PASSWORD
openssl rand -hex 32   # -> INTERNAL_TOKEN
openssl rand -hex 32   # -> SCRAPER_TOKEN
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
`.env.example` already carries working values for all but the secrets above.

`SCRAPER_TOKEN` is the bff's token for the scraper, kept apart from `INTERNAL_TOKEN` so the scraper
holds nothing core trusts. A `.env` from before V4.0.0 lacks it: the scraper then gets `INTERNAL_TOKEN`
(compose falls back) and the bff logs a warning. `sh setup.sh` adds it; recreate `bff` and `scraper` after.

Optional, each with a working default: `WEB_PORT` (`5173`), `UPDATE_CHECK` (`true`), `SERVER_NAME` (`localhost`),
`IMAGE_TAG` (`latest`), `IMAGE_PREFIX` (`ghcr.io/maddaak`), the hosting settings, and the AI settings.

The hosting settings matter once the app is reachable by anyone but its owner (README, "Before it
faces the internet"):

- `BIND_ADDRESS` (`127.0.0.1`): where port 5173 answers. Only this machine by default; `0.0.0.0` opens
  it to the network. Someone who "can't reach it from my phone" after updating needs this.
- `TRUSTED_PROXIES` (`0`): proxies in front of nginx (Cloudflare Tunnel, Caddy, Traefik: `1`). Wrong,
  and the bff's limits see the proxy as every visitor, so a guesser locks the owner out.
- `REQUESTS_PER_MINUTE` (`600`): the bff's per-visitor ceiling, far above real use.
- `AI_DAILY_LIMIT` (`100`, `0` for none): AI calls a day across the app. The bff asks `core`
  (`POST /ai-usage`) before each one, and core keeps the count in `ai_usage`, so a restart keeps it.
- `HSTS` (`false`): `true` sends Strict-Transport-Security, for a real domain with https only. On
  localhost it would make browsers refuse http for every app there, so never suggest it for a local install.

Guessing passwords also slows on the account itself (`core`'s `LoginThrottle`, kept in
`login_failures`): an address the account has signed in from (`known_sign_in_addresses`, sent by the
bff as `X-Client-Address`) keeps its own count, and every other address shares one. Each session token
carries the account's `session_version`: the bff's `requireAuth` asks core (`GET /account/session`)
on every signed-in request, and core's `SessionVersionFilter` checks it again on each call that carries
it. A password change or "sign out other devices" bumps it, ending every older session. Non-GET requests
whose `Sec-Fetch-Site` is `same-site` or `cross-site` are refused by the bff's `sameOrigin`; `same-origin`,
`none` (the user's own action, never another page), and absent (curl) pass.

The AI settings:

- `AI_PROVIDER`: the tool, by name: `anthropic` (default), `openai`, `gemini`, `mistral`,
  `deepseek`, `groq`, `xai`, `openrouter`, or a local `ollama` / `lmstudio`.
- `AI_API_KEY`: that tool's key. Blank disables the AI features, except for the two local tools.
- `AI_MODEL`: required for every tool but Anthropic, which defaults to `claude-sonnet-5`.
- `AI_BASE_URL`: blank uses the tool's built-in address. Set it only to reach a tool somewhere
  else, such as Ollama on another machine. The local tools default to `host.docker.internal`, which
  the compose files map on Linux too.
- `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`: the pre-V4 names, still read when the provider is
  Anthropic, so an existing `.env` keeps working. Never sent to another tool.

The email reminder settings are optional too, all blank by default: `SMTP_HOST`, `SMTP_PORT`
(`587`), `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, and `APP_URL`
(`http://<SERVER_NAME>:5173`, which nginx redirects to https when there's a certificate). Blank `SMTP_HOST` or `SMTP_FROM` means nothing is sent and the
Profile page's Notifications section says so. Email is also opt-in per account (`emailEnabled`, off
by default); the address there starts as the one given at registration and is used only for
reminders. Password-reset links go to the account's own email (`users.email`, Profile > Account). `SMTP_PASSWORD` is the user's secret: hand it to them to fill in, and for
Gmail it must be an app password. `core` reads them at startup, so recreate it (`up -d core`) after
they change; it checks for due reminders every 5 minutes.

Each tool is one entry in `providers` in `scraper/internal/ai/providers.go`, carrying its own
address, key rule, and its spelling of the reply cap (`max_tokens` or `max_completion_tokens`;
the tools disagree, and a wrong one is refused or ignored). Most tools speak the same Chat
Completions protocol, so they share that code; every call goes through one path in `client.go`.
Adding a tool is adding an entry, never a second client. Check its docs for the cap's name.

An AI feature that answers with a saved result is an entry in `assists` in
`scraper/internal/ai/assist.go` (its task, schema, required input, and whether it searches), a bff
service that gathers its input and calls `runAndSave`, and an `AiKind` in core, which decides where
the answer is stored and any rule on when it's allowed. Core stores the answer without reading it;
the scraper's `ready()` check is what keeps an unusable answer from being saved.

**Do not tell someone they need an AI key to get started.** Without one the scraper reports the AI
as unconfigured, the UI hides the AI features, and everything else works. A hosted provider bills the
user's own account; a local model is free and keeps resumes on the machine, but Ollama's default
2048-token context cuts a resume off, so raise `OLLAMA_CONTEXT_LENGTH`. An unknown `AI_PROVIDER`
stops the scraper at startup with a message naming the valid values.

### 3. Certificate (optional)

Only for https. `web/15-choose-https.sh` picks at container start: both files in `certs/` means
https, otherwise plain http on the same port. The bff marks the login cookie secure from
`X-Forwarded-Proto`, so either works without a setting. The user runs this once; it writes to the
system trust store:

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
curl -sk https://localhost:5173/health      # {"status":"ok","service":"bff"}; http:// with no certificate
curl -sk https://localhost:5173/ai-status   # {"aiConfigured":true} only when an AI provider is usable
```

All six services should be `Up`, and `web`, `bff`, `core`, and `scraper` should report a health
status. Then tell the user to open `https://localhost:5173` (`http://` with no certificate; `docker
compose logs web` says which) and register: the first account is
simply the first user, and there is no default login. Registration then closes (`REGISTRATION_OPEN`,
default `false`, reopens it). A user locked out with no email set up gets a temporary password from
`docker compose exec bff node dist/scripts/resetPassword.js <username>`; hand them that command
rather than running it, since it changes their password.

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
- `scraper`: Go. Fetches a job posting from a URL and calls the configured AI provider.
- `postgres` and `mongo`: storage.

Each service joins only the compose networks it needs (`edge`, `api`, `scraping`, `data`, the last with
no internet), so the scraper can't reach core or the databases. A new service, or one calling another,
needs its `networks:` set in both compose files; a missing one fails as an unknown hostname. Mongo has no
password on purpose: only core can reach it, and core would hold the password anyway.

Where a user's data actually is, which is the most common question:

- **Postgres** holds the accounts and the job rows behind the table page: company, role, posting
  URL, how they applied, location (the work model) and city, salary range, stage, outcome, and the
  season (job hunt) each job belongs to. `seasons` lists each account's hunts, with how a finished one
  ended (`closed_at` and the accepted job; that offer's accepted and start days are on the offer), and
  `users.active_season_id` is the one the board, calendar, offers, and Insights show (null shows all).
- **Mongo** holds, per job, everything the details modal shows: the job description text, interview
  notes, free-text notes, rejected reason, the stage history, the interview rounds with their
  interviewers, the job's contacts (with their follow-up day), the resume sent, and the linked-job edges. Image attachments and uploaded resumes live here too, in
  their own collections, as do each account's reminder settings (`reminder_settings`) and the
  reminders already sent (`sent_reminders`, which is what stops a repeat). Saved AI answers sit with
  what they're about: a job's drafts, tailoring, and prep (one per interview type, `prep:<TYPE>`) in
  its document's `aiResults`, a round's debrief on the round, and company briefs, Insights patterns, and the
  offer comparison in `ai_results`, one per account and key. Patterns and the comparison are made from the
  season shown, so their key carries it (`insights:season:<id>`, or `:all`); `AiKind.perSeason` decides that.

## When something is wrong

- **A service is `unhealthy` or restarting.** `docker compose logs <service>` names the cause.
  Every service is set to restart unless stopped, so a transient failure recovers on its own.
- **Mongo logs "Access control is not enabled".** Expected, not a fault: Mongo has no password on
  purpose (see "What runs where"). Don't add one to quiet the warning.
- **`core` exits at startup.** Almost always a bad `.env`: a `JWT_SECRET` under 64 bytes or a
  missing `INTERNAL_TOKEN`. Both fail loudly with a message rather than starting broken.
- **Browser warns about the certificate.** `mkcert -install` was skipped, or the cert was issued
  for a different hostname than the one being opened.
- **AI features are missing rather than failing.** That is deliberate: no usable AI provider means
  they are hidden. Set `AI_PROVIDER`, `AI_API_KEY` (not for a local tool), and `AI_MODEL` (not for
  Anthropic), then restart the scraper to enable them. Calls that fail show as unavailable; `docker compose logs
  scraper` names the provider's reason.
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
cd web  && npm run build && npm run lint && npm run typecheck && npx vitest run
cd scraper && go test ./... && go vet ./...
docker compose up -d --build    # rebuild and run from source
node e2e/smoke.mjs <address>    # against a separate running stack; registers a throwaway account
sh e2e/setup.test.sh            # setup.sh against awkward .env files, in a temporary copy
```

The smoke test registers an account, so on an install that already has one it needs
`REGISTRATION_OPEN=true`. Never run it against someone's real install; point it at a separate stack. It
takes the address as an argument and refuses to run without one, so it can't default onto port 5173.

Conventions worth knowing before changing anything:

- **Where a new field goes is decided by one rule**: Postgres holds only what the jobs table page
  renders; Mongo holds, per job, what the details modal shows. Adding a Postgres column for
  something only the modal shows is the mistake the design exists to prevent.
- **Business rules belong in `core`'s service and model classes**, not in a React handler. A rule
  enforced only in the UI is bypassed by any direct API call.
- **A closed season is read-only, enforced in `core`**: every write to a job, a round, or what hangs off
  them calls `SeasonService.requireOpen` with the job's season first (new jobs go through
  `seasonForNewJob`, which does). A new write endpoint goes in `SeasonClosingTests.everyWrite`, which
  checks each is refused; one left out can change a closed season.
- **A new BFF route prefix must be added to `web/nginx.conf.template`'s allowlist regex**, or it
  405s through the real proxy while every test still passes.
- **A new interview type touches four places**: the enum in `core/.../model/InterviewType.java`
  (and its `phase()`, which `InterviewTypeTests` forces you to decide), `INTERVIEW_TYPES` in
  `bff/.../interviewsClient.ts`, the union + `INTERVIEW_TYPES` + `INTERVIEW_TYPE_LABELS` in
  `web/src/api/interviewsApi.ts`, and `INTERVIEW_ROUND_COLORS` in `web/src/sankeyNodes.ts`, which is
  typed by the union so a missing color fails the build. The bff list is the one place nothing
  catches, and missing it there makes interview prep refuse that type. Its Sankey position when no job has ordered it yet comes from its phase and declaration
  order. A `PANEL_` prefix is what collapses a type into the single Panel node on the Sankey.

**Flyway owns the Postgres schema** (since V4.0.0): `core/src/main/resources/db/migration/V<n>__*.sql`,
run at startup. A schema change is a new numbered file, never an edit to one already released.
`ddl-auto` is `none` in production and `validate` in tests, so the test suite fails when a migration
and an entity disagree. A database Hibernate built before Flyway is baselined at version 0, and
`V1__schema.sql` is written to be a no-op over it (`IF NOT EXISTS` throughout). Write SQL that both
Postgres and H2 accept, since the tests run every migration on H2; `FlywayUpgradeTests` covers the
upgrade path.

`core/migrations/` holds the older hand-run SQL. A fresh install never needs it. Upgrading from a
pre-v3 database is automatic: `core` detects the old shape on startup and converts it, dropping
nothing, so Postgres stays the rollback. The one step that stays manual is
`008_drop_relational_leftovers.sql`, which reclaims the old tables and is destructive. The conversion
lives in `core/.../config/V3Migration.java`; `config/MongoIndexes.java` creates the Mongo indexes at
startup because `@Indexed` alone builds nothing; and `config/EnumCheckConstraints.java` writes each
enum column's CHECK constraint from the Java enum, so adding an enum constant needs no migration.

## Where things stand

The current version is the top heading of CHANGELOG.md; `git tag` lists the published ones (there is
no v3.3.0: it was folded into V4.0.0). Known gaps, so they are not
rediscovered as if they were new:

- **Only one test crosses service boundaries.** Each suite mocks its neighbours; `e2e/smoke.mjs`
  drives a running stack through nginx (CI's `smoke` job runs it on a fresh install), checking the
  fields web reads off each response. It covers the main paths, not every endpoint, so contract
  drift on a path it skips still goes unseen. Add a step when adding an endpoint web depends on.
- **`core` logs little.** Server errors and slow requests (2s and over) get one line each from
  `config/RequestLogging.java`, unhandled exceptions are logged with their method and path, and
  imports, restores, and sample loads log their counts. Nothing else is logged per request.
- **A non-nullable column still needs three steps**: add it nullable, backfill, then constrain, as
  `V2__seasons.sql` does for `jobs.season_id`.
- **The bff's per-address limits live in memory**: the per-minute ceiling and the 10 sign-ins per 15
  minutes. A restart resets them, which matters little since their windows are short and the backoff
  per account and the AI count are in the database. A second bff instance would need a shared store.
- **A signed-in bff route needs only `requireAuth`**, which checks the session with core whatever the
  route calls next. Add the route to `SIGNED_IN_ROUTES` in `bff/test/middleware/requireAuth.test.ts`
  when it's under a new router.
