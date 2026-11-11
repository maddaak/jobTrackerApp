// Drives a running stack through nginx the way the browser does: web -> bff -> core -> Postgres and Mongo.
// Every suite mocks its neighbours, so this is the one check that a field renamed in one service is
// still read by the next. Needs only Node 22+, no packages.
//
//   node e2e/smoke.mjs http://localhost:5173    # CI's fresh install
//   node e2e/smoke.mjs https://localhost:5180   # a mkcert https stack; set NODE_EXTRA_CA_CERTS to its root CA
//
// Registers a throwaway account, so the stack needs registration open (true for a fresh install's first user).
import assert from "node:assert/strict";

// No default: 5173 is where a real install answers, and this writes to whatever it reaches.
if (!process.argv[2]) {
  console.error("usage: node e2e/smoke.mjs <address of a separate test stack>");
  process.exit(2);
}
const BASE = process.argv[2].replace(/\/$/, "");
let cookie = "";

async function call(method, path, body, { expect = 200, accept = "application/json" } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Accept: accept, Cookie: cookie, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie?.startsWith("token=")) cookie = setCookie.split(";")[0];
  const text = await res.text();
  assert.equal(res.status, expect, `${method} ${path} answered ${res.status}: ${text.slice(0, 300)}`);
  return accept === "application/json" && text ? JSON.parse(text) : text;
}

// The keys web/src/api reads off each response, so a rename anywhere upstream fails here.
function hasKeys(object, keys, what) {
  const missing = keys.filter(key => !(key in object));
  assert.deepEqual(missing, [], `${what} is missing ${missing.join(", ")}`);
}

const today = new Date().toISOString().slice(0, 10);
const steps = [];
function step(name, run) {
  steps.push([name, run]);
}

const PASSWORD = "Smoke-Pass-123!";
let jobId;
let firstSeason;

step("health answers through nginx", async () => {
  assert.equal((await call("GET", "/health")).status, "ok");
});

step("registers and is signed in by the cookie", async () => {
  const username = `smoke${Date.now()}`;
  await call("POST", "/auth/register", { name: "Smoke Test", email: "smoke@example.com", username, password: PASSWORD });
  assert.equal((await call("GET", "/auth/me")).username, username);
});

step("adds a job and lists it with every field the board and table read", async () => {
  const created = await call("POST", "/jobs", {
    company: "Smoke Co", role: "Engineer", sourceCategory: "SELF_APPLIED", location: "HYBRID", city: "Austin",
    compMin: 150000, compMax: 190000, startingStage: "INTERVIEW_REQUEST",
  });
  jobId = created.id;
  const [listed] = await call("GET", "/jobs");
  hasKeys(listed, ["id", "company", "role", "sourceCategory", "currentStage", "interviewPhase", "boardPhase", "outcome",
    "url", "location", "city", "compMin", "compMax", "createdAt", "latestInterview", "needsScheduling", "links",
    "seasonId"], "a job summary");
  assert.equal(listed.currentStage, "INTERVIEW_REQUEST");
  assert.equal(listed.city, "Austin");
});

step("logs a round, which moves the job onto the board and the calendar", async () => {
  const start = new Date(Date.now() + 2 * 86400000).toISOString().replace(/\.\d+Z$/, "Z");
  await call("POST", "/interviews", { jobId, interviewDateTime: start, interviewType: "RECRUITER_PHONE_SCREEN" });
  const [round] = await call("GET", "/interviews");
  hasKeys(round, ["roundId", "jobId", "company", "role", "interviewDateTime", "interviewType", "interviewers"], "a round");
  const [listed] = await call("GET", "/jobs");
  assert.equal(listed.currentStage, "INTERVIEW_STAGE");
  assert.equal(listed.boardPhase, "INITIAL_SCREEN");
});

step("saves a contact with a follow-up day, which shows as due", async () => {
  const detail = await call("PUT", `/jobs/${jobId}/detail`, {
    notes: "smoke", sentResume: "smoke.pdf",
    contacts: [{ name: "Dana", role: "RECRUITER", followUpOn: today }],
  });
  hasKeys(detail, ["jobId", "jdText", "notes", "links", "aiResults", "contacts", "sentResume"], "a job's detail");
  const [due] = await call("GET", "/reminders/follow-ups");
  assert.equal(due.contactName, "Dana");
});

step("Insights counts the job, its week, and its resume", async () => {
  const metrics = await call("GET", "/metrics");
  hasKeys(metrics, ["summary", "funnel", "outcomeCounts", "interviewRoundCounts", "sankeyLinks", "sankeyNodeOrder",
    "sankeyPaths", "weeklyActivity", "resumeResponses"], "Insights");
  hasKeys(metrics.summary, ["totalJobs", "activeJobs", "inInterviews", "interviewsDone", "interviewsUpcoming",
    "acceptedCompany"], "the Insights tiles");
  hasKeys(metrics.sankeyPaths[0],["nodes", "jobs", "applications"], "a Sankey route");
  assert.deepEqual(metrics.sankeyPaths[0].applications, [{ jobId, company: "Smoke Co", role: "Engineer", postings: 1 }]);
  assert.equal(metrics.summary.totalJobs, 1);
  assert.equal(metrics.resumeResponses[0].resume, "smoke.pdf");
});

step("an offer lists with its yearly figures, and no comparison is saved for the season yet", async () => {
  await call("PATCH", `/jobs/${jobId}`, {
    company: "Smoke Co", role: "Engineer", sourceCategory: "SELF_APPLIED", currentStage: "OFFER_STAGE", outcome: "ACTIVE",
  });
  await call("PUT", `/jobs/${jobId}/offer`, { baseSalary: 160000, equityGrant: 80000, vestingYears: 4 });
  const [listed] = await call("GET", "/offers");
  hasKeys(listed, ["jobId", "baseSalary", "equityByYear", "compByYear", "averagePerYear", "averagedOverYears",
    "signOnPaidByYear", "marketCheckStale"], "an offer");
  assert.equal(listed.averagePerYear, 180000);
  assert.deepEqual(await call("GET", "/offers/compare"), { comparison: null });
});

step("a new season starts empty, and all seasons brings the job back", async () => {
  const [season] = await call("GET", "/seasons");
  hasKeys(season, ["id", "name", "createdAt", "jobCount", "active", "closedAt", "acceptedJobId", "firstApplied",
    "lastApplied"], "a season");
  firstSeason = season.id;
  await call("POST", "/seasons", { name: "Second hunt" }, { expect: 201 });
  assert.deepEqual(await call("GET", "/jobs"), []);
  await call("PUT", "/seasons/active", { seasonId: null }, { expect: 204 });
  assert.equal((await call("GET", "/jobs")).length, 1);
  await call("PUT", "/seasons/active", { seasonId: firstSeason }, { expect: 204 });
});

step("imports a spreadsheet's rows, skipping one already tracked", async () => {
  const result = await call("POST", "/jobs/import", { jobs: [
    { company: "Smoke Co", role: "Engineer" },
    { company: "Imported Co", role: "Designer", outcome: "REJECTED", appliedOn: "2026-01-05" },
  ] });
  assert.deepEqual(result, { imported: 1, skipped: 1 });
});

step("downloads a backup holding every job and its season", async () => {
  const backup = JSON.parse(await call("GET", "/account/export", undefined, { accept: "*/*" }));
  assert.equal(backup.format, "job-tracker-backup");
  assert.equal(backup.jobs.length, 2);
  assert.ok(backup.jobs.every(job => job.season), "every job carries its season's name");
});

step("closing a season makes it read-only and sums it up, and Edit reopens it", async () => {
  const accepted = await call("PUT", `/jobs/${jobId}/offer/acceptance`, { acceptedOn: "2026-10-20", startDate: "2026-11-16" });
  hasKeys(accepted, ["outcome", "acceptedOn", "startDate"], "an accepted offer");
  const closed = await call("POST", `/seasons/${firstSeason}/close`, { acceptedJobId: jobId });
  hasKeys(closed, ["closedAt", "acceptedJobId"], "a closed season");
  await call("PATCH", `/jobs/${jobId}`, {
    company: "Changed Co", role: "Engineer", sourceCategory: "SELF_APPLIED", currentStage: "OFFER_STAGE", outcome: "ACTIVE",
  }, { expect: 409 });
  const summary = await call("GET", `/metrics/seasons/${firstSeason}/summary`);
  hasKeys(summary, ["name", "closedAt", "firstApplied", "applications", "averageResponseDays", "responsesMeasured",
    "closedApplications", "roundsPassed", "roundsFailed", "rounds", "acceptedOffer", "offers"], "a season summary");
  hasKeys(summary.acceptedOffer, ["company", "role", "applied", "acceptedOn", "startsOn", "daysToAccept"], "the offer taken");
  assert.equal(summary.acceptedOffer.company, "Smoke Co");
  assert.equal(summary.acceptedOffer.acceptedOn, "2026-10-20");
  assert.equal((await call("POST", `/seasons/${firstSeason}/reopen`)).closedAt, null);
});

// nginx sends a browser's page load to the app, not the API; curl-style requests never show this.
step("a browser opening an app page gets the app, not JSON", async () => {
  const page = await call("GET", "/insights", undefined, { accept: "text/html" });
  assert.match(page, /<div id="root">/);
});

// nginx adds these to every answer; a location with its own add_header silently drops them.
step("the app and the API are sent with their security headers", async () => {
  for (const path of ["/", "/assets/", "/health"]) {
    const res = await fetch(BASE + path);
    assert.match(res.headers.get("content-security-policy") ?? "", /script-src 'self'/, `${path} has no CSP`);
    assert.equal(res.headers.get("x-frame-options"), "DENY", `${path} can be framed`);
    assert.equal(res.headers.get("x-content-type-options"), "nosniff", `${path} can be sniffed`);
  }
});

// A stolen cookie must stop working once the password changes, while the session that changed it carries on.
step("a new password signs out every other session", async () => {
  const before = cookie;
  await call("PUT", "/account/password", { currentPassword: PASSWORD, newPassword: "Smoke-Pass-456!" });
  assert.notEqual(cookie, before, "the session that changed it got no new cookie");
  await call("GET", "/jobs");
  const after = cookie;
  cookie = before;
  await call("GET", "/jobs", undefined, { expect: 401 });
  // The posting fetch goes to the scraper, not core, so it checks the session itself.
  await call("POST", "/scrape/text", { text: "Engineer. Remote." }, { expect: 401 });
  cookie = after;
});

step("signs out", async () => {
  await call("POST", "/auth/logout");
  await call("GET", "/jobs", undefined, { expect: 401 });
});

let failed = 0;
for (const [name, run] of steps) {
  try {
    await run();
    console.log(`ok   ${name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${name}\n     ${err.message.split("\n")[0]}`);
    // Later steps lean on earlier ones, so carrying on would only report the same cause again.
    break;
  }
}
console.log(failed ? `\n${failed} step failed against ${BASE}` : `\nall ${steps.length} steps passed against ${BASE}`);
process.exit(failed ? 1 : 0);
