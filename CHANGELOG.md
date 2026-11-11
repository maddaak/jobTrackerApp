# Changelog

This file is the single source of truth for what changed between released
versions. Each merge into main references the version it ships, so the commit
history stays readable and the detail lives here.

## V4.1.0

A finished job hunt can be closed: it becomes read-only and gets a summary of the whole run, from the
first application to the offer taken. Upgrading is a pull and a restart.

### Upgrading
- Automatic. On startup `core` adds the closing fields to the seasons table; every season stays open.

### Offers
- **Accepting an offer asks two days**: when you said yes (today, to start with) and when you start (the
  offer's own start date, to start with), each with a calendar. They're kept on the offer, shown on its
  card, and are what the season summary uses. Editing the offer's figures afterwards keeps them.
- **The Offers tile on Insights** splits decided offers into accepted and declined, and names the company
  of the offer you accepted. Clicking the accepted company shows that offer in full; the declined count
  links to the Declined section of the Offers page.
- **The Offers page groups offers** as Accepted, then Declined, then Pending decision. The AI comparison
  sits with the pending ones, since those are the ones it weighs.

### Seasons
- **The season picker says when each hunt was.** Seasons are grouped under the year they started, newest
  first, each with the months it ran ("Jan–Apr", or "Nov 2025–Feb 2026"). The dates come from the
  applications, not from when the season was made, so the first season an upgrade created is dated by
  the jobs in it. A closed hunt ends when it closed; an open one at its latest application.
- **Close season**, on each season's card, ends a hunt. It asks which offer you accepted, if any, and
  starts the two days from what the offer already holds; a change there is saved back to the offer, so
  each has one accepted day and one start date. The offer picked is marked accepted.
- **A closed season is read-only.** Its jobs, rounds, notes, offers, images, links, and saved AI answers
  can't change, nothing can be added to it or moved in or out, and `core` refuses any attempt, not just
  the page. A banner on every page says so while it's the season shown, and **+ Add job** is off.
  **Edit**, on the banner or the season's card, reopens it; closing it again starts from the offer named
  last time.
- **The season summary**, opened from a closed season, shows:
  - when the hunt started and closed, and how many applications it held;
  - the average response time, from applying to being rejected, the role closing, or marking it
    ghosted. It counts the closures that carry a date: a spreadsheet import records none, so those are
    left out, and the summary says how many it measured;
  - how many interview rounds you passed and didn't, by kind of round, with the companies behind each;
  - the offer you accepted: applied, accepted (and how many days that took), and start date.
- A role reposted and linked as replacing the last counts once throughout: it starts at its first
  application and ends where its last posting did.
- A backup carries each closed season and the offer taken (its days travel with the offer), and a
  restore puts them back.

### Reliability
- **What each AI feature sends is now described accurately.** The Patterns panel said only counts were
  sent; it sends your rejection reasons too, as you wrote them. The counter-offer panel now says it uses
  the offer's notes and a market check only while it's current. The README's list of what goes to the
  provider adds the company and role, interviewers' names, and rejection reasons.
- The GitHub Actions the workflows use moved to their Node 24 versions, ending the deprecation warning
  on every run.
- Buttons show the hand cursor again, so the clickable counts on Insights (the interview rounds table's
  passed and not passed) look clickable. They also highlight on hover and say what they open.

## V4.0.0

A board replaces the table as home, with pages for submitted applications, offers, paused jobs, and
closed ones around it. AI works with any provider and helps from adding a job through its rounds to
the offer, interviews carry an end time, and Insights says which rounds you pass. Every existing stage is kept. Upgrading is a pull and a restart.

### Upgrading
- Automatic. On startup `core` adds the new interview-phase field to the jobs table (empty until a
  card is moved), rewrites the stage and status checks so the new Paused status is accepted, and
  gives each job's detail document a version number. Existing jobs keep their stages and land in
  the matching board column.
- **Check your `.env` first:** `core`, the bff, and the scraper now refuse to start if
  `INTERNAL_TOKEN` or `JWT_SECRET` is still the `.env.example` placeholder, which is public. The log
  says which one. Generate real values as in the README's Quick start.
- Run `sh setup.sh` once: it adds the new `SCRAPER_TOKEN` to your `.env` and changes nothing else.
  Without it the app still starts, with the scraper sharing core's token as before.
- A `.env` with `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` keeps working; see AI below for the new
  settings.
- Locations are no longer tied to New York. A job saved as NYC in person becomes **On-site** and NYC
  hybrid becomes **Hybrid**, each with the city set to New York, so nothing loses where it was. A
  saved market check and an older backup are read the same way.
- `core` now manages its database layout with numbered migrations (Flyway). On first start it records
  your existing database as its starting point and changes only what V4 adds. It also widens the
  posting link column, which on databases from earlier versions refused a link over 255 characters.
- Upgrading straight from a version before v3 still converts in one start, and the converted jobs
  save normally right away.
- Every job you already have goes into one season, "My job hunt", which is the one shown. Rename it
  on the Seasons page.
- **The app now answers only on the machine running it.** If you open it from a phone or another
  computer, set `BIND_ADDRESS=0.0.0.0` in `.env` before restarting. Everyone stays signed in through
  the upgrade.
- Email reminders stay off until `SMTP_*` settings are added to `.env`; see Reminders below.
- Registration closes once an account exists, which an existing install already has. Set
  `REGISTRATION_OPEN=true` to add another. Existing accounts get empty name and email fields, filled in
  under Profile.

### Board
- The home page is a board of the jobs you're actively working, in four columns: **Interview
  Request**, **Initial Screen**, **Mid Rounds**, and **Panel**. The last three split up the existing
  Interview Stage, so a job can say which round it's at. Nothing was removed or renamed in the data.
- Drag a card between columns, or use the keyboard: Space picks it up, the arrow keys jump between
  columns, Enter opens it. Screen readers hear the company and column names.
- Three exits beside the columns: **Got an offer**, **Pause**, and **Close** (which asks for the
  closed outcome). A collapsible **Submitted** tray on the left holds applications waiting on a
  reply; drag one onto a column when they answer, or a card back into it.
- Cards show the latest round, a **Waiting on results** badge, and a **Schedule round** badge when
  an interviewing job has nothing booked. The badge is worked out from the calendar, so adding the
  round clears it.
- A card you haven't moved is placed by the furthest round logged; dragging it stores the column.
- The columns and exits fit a 1280-pixel-wide laptop screen without scrolling sideways.
- **Follow-ups due** above the columns lists the people whose follow-up day has come, each opening its
  job. It needs no email set up.

### Seasons
- Each job hunt is a **season**, so a search next year doesn't mix with this one. The season picker at
  the top of the sidebar switches between them, starts a new one, or shows **All seasons** together.
- The board, Submitted, Offers, Paused, Closed, All jobs, the calendar, and Insights all show the
  season picked. A new season starts with all of them empty; the other seasons keep every job.
- A new job, an import, or sample data goes into the season shown (the newest one when showing all).
  Importing skips a job already in that season only, since applying again in a later search is a new
  application.
- A **Seasons** page (the picker's **Season** heading, or **See all seasons** in the picker) lays the seasons side by
  side, newest first: the dates each covers, applications, how many heard back and were interviewed
  (with the share of applications), offers, and how many are still active. **Open board** and **See
  Insights** switch to that season and go there. **Rename** edits the name in place and the picker
  follows at once; **Delete** removes an empty season; **Start a new season** is at the top. A season
  holding jobs can't be deleted, so no job is lost with it.
- **Move to another season** in a job's dialog refiles it.
- Reminder emails cover every season, since an interview in an older search is still real.
- A backup records each job's season by name, and a restore opens on the newest one.

### Keyboard
- `/` or Ctrl K opens a quick search that finds a job by company, role, or city and opens it.
- `N` adds a job, `G` then `B`, `C`, `I`, or `A` goes to the board, calendar, Insights, or all jobs,
  and `?` lists every shortcut. They pause while you're typing in a field.

### Pages
- **Submitted**: applications still waiting on a reply, with **Got an interview request** to put one
  on the board. One with no reply in 30 days is flagged, with **Mark ghosted** on it and a banner to
  mark them all at once, so the page holds only what might still answer.
- **Offers**: base, bonus, equity, sign-on, start date, and decision deadline per offer, with an
  average per year, and a **Decision** picker (Undecided, Accepted, Declined) that can be set back if
  you change your mind. A blank amount is kept as unknown, not zero. With every offer paused, the page
  says so and where to find them.
  - The bonus is entered as dollars or as a percent of base, as the letter states it.
  - Equity is entered as the letter states it too: a number of shares and a share price, or a dollar
    value, then the years it vests over and an even or custom schedule (such as 5/15/40/40). The page
    works out each year's shares and dollars, so a back-loaded grant shows how little it pays early
    on. A new price is one field to edit. Only whole shares vest, and the years always add up to the
    grant: 30 shares at 5/15/45/35 vest 2/5/13/10, not the 32 that rounding each year alone gives.
    Letters round their own tables in ways no percent rule reproduces, so each year's share count can
    also be typed straight from the letter; a blank year keeps the worked-out count, and the form says
    if the years don't add up to the grant.
  - The **sign-on bonus** is one payment, in year 1. An **offset**, the cash a letter pays in the
    years a back-loaded grant leaves thin (such as $60,000 in year 1 and $45,000 in year 2), is entered
    under Equity, in each year's column beside that year's vesting percent. An offer can have both.
    Each year's column then shows its shares, its stock, and what the year pays, with and without the
    letter's assumed growth. An offer saved with one sign-on amount reads it as the sign-on bonus.
  - **Expected price growth**, optional, is the yearly share-price rise a letter assumes, such as 15%.
    Each later vest is projected at the price grown that much a year, compounding and taken to the
    cent, and shown on its own line beside the today's-price figures, marked as the letter's assumption.
  - **Pay by year** adds base, bonus, that year's vesting, and that year's offset and sign-on, so an
    offer that is cash heavy early and stock heavy later shows its real shape.
  - **The average per year** is everything an offer pays, sign-on and offsets included and at the letter's assumed
    growth, divided by the years. Every offer is averaged over the same years, the longest any of them
    pays over, so a four-year grant with a two-year offset and a base with a sign-on
    are compared on equal terms. It is what the AI comparison and the counter-offer draft weigh; the
    market check still compares base, bonus, and the grant spread evenly, as pay sites quote it.
  - An **Offered title** records a title or level different from the posting's, such as after a
    downlevel. The card shows it, and the AI judges pay against it.
- **Paused**: a new status for hiring freezes and holds. Resuming puts a job back where it stood.
- **Closed**: rejected, ghosted, withdrawn, and closed-position jobs, filterable by outcome.
- **All jobs**: the table from earlier versions, kept for scanning and bulk edits.
- A left-hand menu groups the pages with live counts, and adding a job says where it landed.

### Job dialog
- **People**: the recruiter, referrer, hiring manager, or anyone else for the job, with email, a
  LinkedIn link, notes, and when you last spoke. **Spoke today** updates that in one click. They're
  part of the job's backup.
  - **Follow up by** sets a day to get back to someone. Once it comes the person is marked due here,
    listed on the board, and included in the follow-up email. Speaking to them on or after that day
    settles it.
- **Resume sent** records which of your resumes went with the application. It's separate from the
  recommended one, and Insights compares replies by it.
- **Status**, **Stage**, and **Waiting on results** in one place, the same controls the table uses.
  Stage speaks the board's language: Submitted, Interview Request, the three interview columns
  (grouped under Interviewing), and Offer.
- Reopening a closed job returns it to the stage it last held, instead of leaving it Finalized with
  no page to show it.
- Unticking Waiting on results returns the job to the stage it held before, so a job waiting since
  Interview Request doesn't gain an Interview Stage it never had.
- The stage history folds Waiting into the stage it paused, so ticking it on and off adds no rows.
  Deleting a row still removes every entry behind it.
- Two tabs saving the same job's details no longer silently overwrite each other: the stale save is
  refused instead.

### Adding a job
- One **Job description** box, whichever way you add: filled from a fetched link, pasted, or typed.
  It's saved with the job, AI or not. Before, skipping the link left nowhere to put it unless AI
  was set up.
- **Back** returns from the form to the link, keeping what you typed.
- **Get recommendation** runs on whatever is in the box, and can be run again after editing it. It's
  now short: recommended or not, based on a few key words, any gaps flagged, and which resume to use.
  It also names the company and role, filling them in when still empty. It leaves room for models that
  always think first, which used to spend the whole reply on thinking and come back unavailable.
- **Fill in title, location and pay** reads a pasted description with no AI, so it's free and works
  with AI off. Only empty fields are filled, so nothing typed is overwritten.
- You choose whether a job starts as applied or as a recruiter reaching out.
- **Location** is the work model (Remote, Hybrid, or On-site) and a separate **City**, for a search
  anywhere. A fetched posting fills in the city when it names one, and the market check and offer
  comparison price for that place.

### Interviews
- A round has an optional **Ends at** time. It defaults to an hour after the start when you first
  enter one, and moving the start drags it along. A round saved without one keeps no end rather than
  getting an invented hour. `core` refuses an end before the start.
- The calendar, the banner, and the job dialog show the range.
- **Add to calendar** on an upcoming round, and **Add upcoming rounds to my calendar** on the
  Calendar page, download an `.ics` file that Google Calendar, Apple Calendar, and Outlook open, with
  the time, the meeting link or address, and who you're meeting. It's a file rather than a
  subscription link because a calendar service can't reach an app running on your own machine.
- Adding a round from a job starts blank instead of prefilled with the current time.
- The upcoming-interviews banner and the Insights tile leave out closed jobs, and count a round as
  upcoming until it ends rather than until it starts. Both now follow the same rule.
- One add-interview dialog everywhere: the table's separate inline editor, which had drifted from it,
  is gone.

### Insights
- Opens with headline tiles: applications, response rate, interviews done and upcoming, and round
  pass rate. The pipeline flow is still there, one click down.
- **Weekly activity** charts applications sent and interviews held in each of the last 12 weeks, with
  this week's count and the weekly average, so a search going quiet shows before the replies stop.
- **Replies by resume** shows, for each resume recorded as sent, how many applications it went with
  and how many heard back (a recruiter reaching out or further). Fewer than five is marked as too few
  to compare.
- The interview rounds table shows how each type went: times faced, passed, not passed, and a pass
  rate. A panel counts once however many interviews it held. Withdrawing, a closed req, and a
  pipeline still open are left out rather than counted as failures. Only rounds already held count,
  so a job rejected before its booked round stopped at the round before, while a round with the next
  one already booked counts as passed. The pipeline flow draws only held rounds too. Clicking a figure
  lists the companies behind it.
- A round type no job has ordered yet sits in its phase on the pipeline flow; before, a take-home
  or code review with no ordering job was drawn after Panel.
- Rounds belonging to deleted jobs no longer steer the flow's order.
- The pipeline flow is tidier: every column stacks its stages in one fixed order (earlier rounds above
  later ones, still-open outcomes above closed ones), so flows run in bands instead of criss-crossing.
  It grows taller as stages are added. Hovering a stage traces how its jobs got there, from the
  application up to that stage, and the one step each took next, so it shows which progressed: hover
  Offer and the route each offer took through every earlier round lights up, in proportion to how many
  jobs took each step, while the steps beyond that and everything off the route fade. The routes are
  listed under the chart too, with routes that only part ways later counted as one, beside the
  companies at that stage, so hovering alone shows who is there; the separate company box is gone.
  Point at a route in the list and the chart and the companies narrow to that route; point at a
  company and its route is picked out in the list and on the chart (two jobs at one company show
  their roles). Clicking works both ways: a route keeps its companies listed, and a company keeps its
  route, with its companies and that one marked, until clicked again. Clicking a stage
  pins it: it stays while you read or copy, another stage hovered meanwhile shows in its place until
  the pointer leaves, and clicking it again, Escape, or the ✕ lets go. Enter pins from the keyboard.
  Hovering no longer flickers: the area under the chart keeps its height whatever it shows, so the
  page doesn't jump under the pointer, moving between stages or down into the details keeps the
  highlight, a long route or company list scrolls on its own instead of spilling out (which gave the
  chart a scrollbar that narrowed it under the pointer), and hovering follows what the pointer moves
  over rather than enter and leave events, which some Chrome setups send with nowhere on the other side. A route too long for the window is cut
  short, with the whole route on hover, rather than wrapping.
- On the pipeline flow, jobs linked as replacing each other (a role reposted) are one journey carried
  on: every posting's rounds in order, as far as any of them got, ending where the newest stands. A
  repost no longer shows as two dead ends at Position Closed beside a route that starts at the panel.
  The company is listed once, as "(3 postings)", and a line above the chart says how many journeys
  came from how many applications. Everything else, the tiles and funnel included, still counts each
  posting, since each was its own application. Related links stay separate.
- A paused job ends at its own **Paused** node on the pipeline flow; it was drawn into In Progress, as
  if still moving. Only active jobs count as in progress now.

### AI
- **Any provider.** Set `AI_PROVIDER` to `anthropic`, `openai`, `gemini`, `mistral`, `deepseek`,
  `groq`, `xai`, or `openrouter`, or to `ollama` or `lmstudio` for a model on your own machine (no key
  needed). Each tool knows its own address and settings; `AI_BASE_URL` is only for a tool somewhere
  unusual. An unknown name stops the scraper at startup with the valid ones listed.
- **A request is billed at most once.** It's retried only when the provider turned it away before
  doing any work (rate limited or overloaded), never after a server error or a timeout, and every
  attempt shares one 100-second budget. Before, one click could ask the provider up to three times
  over about four and a half minutes.
- **Help me decide** on the Offers page compares the undecided offers against priorities you write,
  seeing each grant's year-by-year vesting as well as its average. The answer is saved for the season,
  so coming back shows it with your priorities instead of paying for another, and it says when an
  offer has been edited, decided, or added since. A comparison that fails keeps the last one and what
  you typed. It's saved for the season it was made from, even if you switch while it runs.
- **Check the market** on an offer says whether it's below, at, or above typical pay for the role
  and location, with a typical range and points to negotiate. It prices the offered title when there
  is one, and is told the posted title, so a downlevel is judged at the level offered and the answer
  can say whether to negotiate the level. With Anthropic it searches the web and lists its sources;
  other providers give an estimate, labelled as one. The result is kept with the offer, shown as one
  line that expands to the full analysis, and can be removed. Editing the offer's pay, title, or
  location keeps it but marks it out of date, with **Check again** beside it.
- A request the scraper refuses (too many offers, an empty description) now says why instead of
  reading as "AI unavailable".
- A match with no reasoning, or a reply with trailing text after its JSON, is handled instead of
  shown as a verdict or an error.
- The unused resume-variant recommendation endpoint is removed.
- **Every AI feature below is a button, and its answer is saved**: shown again for free, collapsed to
  one line until opened, and only rerun or removed on request. With AI off they're hidden.
- **Company brief**, on Add Job once a company is typed and in Job details: what the company does,
  its size and funding, recent news such as layoffs, what candidates report about interviewing there,
  and what to ask about. It's kept per company, so a second job there reuses it. Like the market check
  it searches the web with Anthropic and is labelled an estimate elsewhere. Changing the company while
  one runs drops that answer rather than showing it under the new name.
- **Interview prep** in Job details, for whichever kind of round you pick (it starts on the job's
  latest), so you can prep before a round is booked. Each kind's prep is kept. It's fitted to the
  role's field: LeetCode problems candidates report the company asking for a coding round, design
  primers for system design, STAR guides and the company's values for behavioral rounds, and the
  matching question banks for other fields, such as valuation and modeling for a finance role. Each
  is a link to open. It also gives topics to review, likely questions, which experiences on your
  resume to lead with, and questions to ask. It uses the job description, the rounds already held,
  and the resume recommended for the job (else your newest), and searches the web. Paste what the
  recruiter sent about the round (format, length, topics) and the prep is built around it; it's kept,
  so you can correct it and run again.
- **Debrief**, on each round: paste rough notes after it for a clean summary, a thank-you
  email to copy, and anything you said you'd follow up on. The notes are kept, so a correction can be
  run again.
- **Follow-up email** in Job details, once there's been an interview: a short note to the recruiter
  about the last round held, using its debrief when there is one.
- **Counter-offer email** on each undecided offer, grounded in its market check (when it's still
  current), any downlevel, and your other open offers, with the asks listed separately.
- **Resume tailoring** in Job details: specific bullet rewrites and missing keywords for this job's
  description, for the resume you pick. It's told never to invent experience.
- **Patterns** on Insights: what stands out across the search, from the funnel, outcomes, round
  results, how you applied, where closed applications stopped, and your rejection reasons. Only
  counts and reasons are sent, never company names, and it says when you've added jobs since. Each
  season keeps its own patterns, as does showing every season, saved under the season they were made
  from even if you switch while they run. A backup restore leaves out a single
  season's patterns and comparison, since the season comes back under a new id; run them again there.

### Reminders
- A **Profile** page holds your account and **Notifications**. Email is opt-in: nothing is sent until
  you turn it on and give an address, and turning it off keeps your choices for later.
- Four kinds, each switchable: a **daily digest** at an hour you pick (today's and tomorrow's
  interviews, deadlines this week, rounds to schedule, jobs gone quiet; skipped on a quiet day),
  **interview soon** an hour before a round with its meeting link, **offer deadline** two days
  before an offer's decision date, and **follow up**, off by default, when a job has heard nothing
  for 7 calendar days after your last interview and again at 14. Applications with no interview are
  never chased, and a new round starts the count over. The same switch covers a person's **Follow up
  by** day: one email that morning naming who, and a line in the digest.
- Times follow your own time zone, taken from the browser. Each reminder is sent once; a backlog of
  follow-ups arrives as one email. Only active jobs are reminded about.
- Sent through any SMTP account set in `.env` (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`,
  `SMTP_PASSWORD`, `SMTP_FROM`). **Send a test email** shows the mail server's reason if it fails.
  `APP_URL` sets the link in each email. Its default, `http://<SERVER_NAME>:5173`, works with or without
  a certificate: with one, plain http on that port is redirected to https.

### Accounts and setup
- **`setup.sh`** makes `.env` with fresh secrets, and a certificate if `mkcert` is installed, so
  setting up is one command. It never replaces a value already set. Without a shell, Docker runs it:
  `docker run --rm -v "${PWD}:/app" -w /app alpine sh setup.sh`. It says what it does at each step,
  reporting each secret as made or kept without printing it, and works only on this computer: CI runs
  it with networking switched off.
- **The README says where your data lives** and lists every outside connection the app makes. For
  setting up with Claude Code, `.claude/settings.json` refuses reads of `.env`, `certs/`, and backups,
  and the commands that print settings, so keys stay out of the assistant's conversation. Backup files
  made in the repo folder are gitignored.
- **`WEB_PORT`** in `.env` moves the app off port 5173 when something else holds it, such as a Vite
  dev server. Before, that meant editing the compose file.
- **A clone on Windows works as is.** `.gitattributes` keeps every file's line endings Linux-style, which
  the setup script, the containers' start scripts, and the secrets in `.env` all need.
- **mkcert is optional.** With no certificate in `certs/`, the app serves plain
  `http://localhost:5173`, which browsers treat as secure on the same machine. The login cookie is
  marked secure whenever the page came over https. An install with a certificate is unchanged.
- **Try it with sample data** on a new account's empty board loads a made-up search, dated from today, so every
  page has something to show: rounds coming up, offers to compare, rejections, and a Sankey. A banner
  says while it's there, and **Remove sample data** takes out only those jobs, leaving anything you've
  added. Sample interviews never send reminder emails.
- **Register** asks for a name and email as well as a username and password, then opens a short
  **Welcome**: upload resumes, turn on email reminders (the sign-up address is filled in), and a setup
  check that says whether AI and email are working and gives the `.env` lines if not. Every step can be
  skipped.
- **Registration closes once the first account exists**, so nobody else who can reach the app can sign
  up. Set `REGISTRATION_OPEN=true` in `.env` to allow another account.
- **Profile** edits your name and email and changes your password. An account from before V4 is asked
  to add a name and email there.
- **Forgot password?** on the login page emails a one-hour, single-use reset link when email is set
  up. It never says whether an account exists. Without email, run
  `docker compose exec bff node dist/scripts/resetPassword.js <username>` on the machine for a
  temporary password; no browser can reach that route.
- **Your data** under Profile downloads a backup: every job, round, note, offer, image, resume, and
  saved AI answer, plus reminder settings, in one JSON file (not your password). **Restore from a backup** puts it back
  into an account with no jobs or resumes yet, such as a new install; links between jobs follow them to
  their new ids, and a failed restore removes what it added. Images in it are checked like uploads, and
  any that wouldn't pass are left out. Backups up to 200 MB.

### Hosting safely
For anyone who runs it somewhere other people can reach. The README's **Before it faces the internet**
walks through the settings.
- **Only this machine by default.** The app's port answers on `127.0.0.1` unless `BIND_ADDRESS` opens
  it (`0.0.0.0`), so a laptop on shared Wi-Fi doesn't serve it to everyone there.
- **Guessing a password slows down on the account itself**, not only per address: after 5 wrong
  passwords in a row, each attempt waits, from 30 seconds doubling up to 15 minutes, and says how long.
  It applies the same to a username that doesn't exist, so the wait never confirms an account. An
  address you've signed in from before keeps its own count, so someone guessing elsewhere can't keep
  you waiting there, while every other address shares one, so spreading guesses wide doesn't help.
  Guesses sent all at once wait their turn too. It's kept in the database, so a restart doesn't reset
  it, and a password reset clears it. Too many attempts from one address now says why instead of
  "request failed".
- **Changing your account email takes your password**, since reset links go there, and the old
  address gets a note when email is set up. A stolen session alone can't redirect them, and guessing
  the password this way shares sign-in's limit of 10 tries per 15 minutes.
- **Forgot password?** answers in the same time whether or not the username exists; the email goes
  out after.
- **Changes come only from the app's own pages.** A page on another site, or another port on the same
  machine, can't make your browser save, delete, or run AI features here.
- **The scraper gets its own token**, `SCRAPER_TOKEN`, so the one service that reads outside web pages
  holds nothing `core` trusts. `sh setup.sh` adds it to your `.env`; until then it shares the old one
  and the bff's log says so.
- The AI connection never follows a redirect, so a misconfigured `AI_BASE_URL` can't pass your key to
  another host. A provider's error is logged in part, not whole.
- **Each service reaches only the ones it works with.** The scraper, which reads outside web pages,
  can no longer reach `core`, Postgres, or Mongo, and the databases can't reach the internet. Nothing
  to do: `up -d` sets it up, and your data stays where it was.
- `bff`, `core`, and the scraper run with no Linux capabilities and can't gain privileges.
- Every field a request sends has a size limit, and an account keeps up to 50 resumes, so no request
  can grow a job past what the database stores. A Word file that unpacks to more than 100MB is refused.
- The 5MB spreadsheet import is read only after sign-in.
- **A changed password signs out every other device**, a stolen cookie included, on every route,
  while the one that changed it stays signed in. A reset link or temporary password does the same, and
  ends any other reset link still out. **Sign out other devices** under Profile, **Password** does it
  without a new password. The bff checks this on every signed-in request, whatever it calls, so a
  device signed out this way opens on the sign-in page and can't upload, restore, or run an AI feature.
- **Behind a proxy or tunnel**, `TRUSTED_PROXIES` says how many sit in front, so the limits see each
  visitor rather than counting everyone as the proxy.
- **A ceiling on requests**, `REQUESTS_PER_MINUTE` per visitor (600 by default), stops floods and
  scripts. It sits far above real use, unlike the old limit that blocked the owner.
- **A daily cap on AI calls**, `AI_DAILY_LIMIT` (100 by default, `0` for none), so a stolen session or
  a runaway loop can't run up the AI bill. The day's count is kept in the database, so a restart
  doesn't start it over. A refused call answers 429 and says why and when it resets, a resume summary included, which
  keeps whatever it had rather than being marked failed.
- **Security headers on every page**: scripts only from the app itself, no framing by other sites, no
  MIME sniffing, and no nginx version in replies. **`HSTS=true`** adds Strict-Transport-Security for a
  real domain with https; it's off by default, since on `localhost` it would force https on every other
  local app.
- `AI_DAILY_LIMIT` counts calls, not searches: a company brief or market check may run up to 4 web
  searches, which the provider bills on their own.

### Job links
- Fetching a posting reads an hourly or monthly salary as yearly pay, skips a signing bonus quoted
  as a range, keeps decimals, and refuses a minimum above the maximum.
- "Not remote" no longer reads as remote, and "on site" and "in office" are recognized.
- A link that redirects to an internal address is reported as blocked, not unreachable.
- A link whose host is an address in octal, hex, or short form is refused on every system; before,
  macOS and Linux disagreed on what some of them meant.

### All jobs table
- **Import from a spreadsheet** brings in a CSV saved from your own sheet, Google Sheets, Excel, or
  another tracker. Columns are matched by name and can be changed before anything is saved, and the
  first rows are shown as they'll land. Each job keeps its date applied, how far it got, and how it
  ended, so the funnel and Sankey count it from the start. A job already tracked under the same
  company and position is skipped, so importing twice adds nothing.
- **Download as a spreadsheet** saves the jobs shown as a CSV with the same columns the importer
  reads, so an export imports back where it was, waiting on results included. Excel opens it with accents intact, and a cell that
  a spreadsheet would run as a formula is written as plain text.
- **Save these filters** names the filters in use, such as "remote, still active", to apply again in
  one click. They're kept in this browser.
- A **City** column, beside Location.
- Stage and Status use the job dialog's controls, so the table can no longer set Finalized on an
  open job (which `core` silently undid).
- After a dropdown change the row keeps its new value until the refreshed list arrives, instead of
  flicking back to the old one.
- Stage sorts and filters in pipeline order, in the board's terms.
- The column filter opens as a dialog and closes with Escape.

### Accessibility
- The board, calendar, pipeline flow, and filters work by keyboard and read sensibly to a screen
  reader: calendar weeks are rows, the Closed page's filters are toggle buttons, and pipeline-flow
  nodes open with Enter.

### Reliability
- `core` uses about a third less memory, around 300MB idle against 415-620MB before: Java is tuned for
  one user and hands idle memory back. A 150MB backup still restores. `JAVA_TOOL_OPTIONS` overrides it.
- `core`'s log names the method and path of any request that fails on the server or takes 2 seconds
  or more, and of any unexpected error, so `docker compose logs core` says which call broke. Imports,
  restores, and sample data log their counts.
- CI now starts the whole stack as a fresh install and drives it through nginx, checking that each
  service still reads the fields the next one sends. Each service's own tests mock the others, so
  they couldn't catch that.
- The database layout is versioned with Flyway, and the tests check every migration against the code
  that reads it.
- A login token without a user id is refused.
- Ordinary use stays far below the per-visitor ceiling (see Hosting safely), so it is never limited.
- An AI feature that searches the web, such as Check the market, no longer shows "failed" after 60
  seconds while the answer is still on its way. nginx gave up at 60 seconds; it now waits as long as
  the bff does, so a slow search gets back to the page.
- A malformed request body no longer writes a stack trace to the bff log.
- Docker builds no longer copy the host's `node_modules` into the images.
- The app opens faster: the first download is about half the size, compressed, and the Insights,
  Calendar, All jobs, Offers, Resumes, Seasons, and Profile pages load when first opened.
- CI's jobs get read-only repository access.
- Smaller images, about 260MB less in all: `core` runs on Alpine (676MB to 471MB), the bff carries
  only Node itself, without npm or yarn (256MB to 203MB), and the scraper is built without debug
  symbols (28MB to 23MB).
- The scraper image moves to a supported Alpine release.

## V3.2.0

Linked jobs, image attachments, deletable stage history, a Position Closed outcome, and a Sankey
that follows each job's real round order. Upgrading is a pull and a restart.

### Upgrading
- On an existing database a newly added enum value was rejected by Postgres and surfaced as a
  generic 409: Hibernate writes a `CHECK` constraint listing an enum's values when it creates the
  column, and `ddl-auto=update` never widens it. `core` now rewrites those constraints from the
  enums on every boot, which fixes the class rather than the one value. A fresh install is
  unaffected.

### Linked jobs
- Two rows can be linked, for when one application becomes another: a company closes the req and
  redirects you to a different posting. A typed relation, not text in the notes, so it reads from
  either row and survives edits.
- `replaced by` and `replaces` are the two ends of one link, written together so each row states it
  in its own voice. `related to` is symmetric.
- A 🔗 badge by the company name lists a row's links; clicking one scrolls to that row and
  highlights it, or says so when a filter is hiding it.
- The details modal adds and removes links. Re-linking replaces the relation rather than
  duplicating it, and deleting a job drops only the edges pointing at it.

### Attachments
- A job's details modal takes image attachments, for things like a screenshot of a system-design
  diagram. Paste one with Cmd+V, drop it on the modal, or pick a file. A paste into a text field
  stays text, even when the clipboard carries an image alongside it.
- They are listed as links, not rendered inline, so opening a job never downloads its screenshots.
  Saving one keeps its filename.
- The stored type is detected from the file's magic bytes, never the name or the browser's claim,
  and SVG is refused: it can carry script, and these are served back inline from our own origin.
  PNG, JPEG, and WebP only, 10MB and 20 images per job. Deleting a job deletes its attachments.

### Stage history
- An entry can be deleted from the details modal, undoing a mis-clicked stage change. The job's
  stage rewinds to whatever the history then ends on, so the table's Stage dropdown follows rather
  than keeping a stage the job's own history no longer records. A closed outcome still pins the job
  to Finalized, and a job always keeps at least one entry.
- Repeats of the same stage show as one row, and deleting that row deletes every entry behind it.

### Metrics
- The Sankey's round order now comes from the transitions jobs actually ran, resolved by a
  topological sort, instead of an average position. A round seen only alone in other jobs no longer
  jumps ahead of the round a job really sat first, and a genuine disagreement between two jobs is
  settled by which direction more of them experienced.
- Recolored: Resume Check and Interview Request no longer sit side by side in near-identical blues,
  and Position Closed gets its own terminal.

### Interview rounds
- New `Data Modeling` round type in the interview-type dropdown. It gets its own node on the
  metrics Sankey, its own color, and its own row in the round counts. No data change; existing
  rounds keep their type.

### Outcomes
- New `Position Closed`, for a req the employer closed rather than a rejection, ghosting, or
  withdrawal. Closes the pipeline like those three, with its own Sankey terminal and outcome-count
  row. Rows previously marked withdrawn for a closed req need re-marking by hand.

### Add job
- While a pasted job description is being read, the fields below it are locked behind a "Reading the
  job description…" overlay, so nothing is typed into fields that read is about to speak to.
- A job description pasted by hand is now saved with the job. It was read for the recommendation and
  then dropped, so the posting we could not fetch stayed unavailable in Job Details afterwards.

### Fixes
- A salary written as a mixed range, like `$120k - $150,000`, was read as $120,000 to $150,000,000.
  Written the other way round it was dropped instead, leaving the job with no salary at all.
- An upload that is too large now answers 413 wherever it is refused, rather than 400 from one
  service and 413 from another.
- Deleting a job no longer removes its details before the attachment and link cleanup that could
  still fail, which on a failed delete left the job in place without its history or notes.

### Table and calendar
- A job at Interview Request gets its own row color instead of sharing yellow with Resume Check.
- Calendar entries show their start time and sit in chronological order within a day.
- Following a 🔗 badge to a row that is already highlighted re-runs the highlight.

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
  manual, optional, and to be run only once the rebuilt app is confirmed working.
- `./core/migrations/run_migration.sh` remains for converting by hand: it backs up both stores,
  merges duplicate documents, exports from Postgres, loads into Mongo, and verifies.
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
  appears more than once (for example "Contoso (2)").
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
