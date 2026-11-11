import { describe, it, expect, vi, beforeEach } from "vitest";
import { request } from "../testServer.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";
const ROUND = "3f2b8c1e-5d4a-4e6b-9c7d-1a2b3c4d5e6f";
const EARLIER = "aaaaaaaa-5d4a-4e6b-9c7d-1a2b3c4d5e6f";

function authCookie(userId = "1") {
  return `token=${jwt.sign({ sub: userId, username: "alice" }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" })}`;
}

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

type Route = [method: string, url: RegExp, status: number, body: unknown];
type Call = { method: string; url: string; body: Record<string, unknown> };

// Answers by method and URL rather than call order, since several reads run at once.
function serve(...routes: Route[]): Call[] {
  const calls: Call[] = [];
  (fetch as ReturnType<typeof vi.fn>).mockImplementation((url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    const route = routes.find(([m, pattern]) => m === method && pattern.test(url));
    return Promise.resolve(route ? fakeResponse(route[2], route[3]) : fakeResponse(500, {}));
  });
  return calls;
}

const sent = (calls: Call[], method: string, url: RegExp) => calls.find(c => c.method === method && url.test(c.url))?.body;

const SAVED = { content: { overview: "Makes anvils." }, createdAt: "2026-10-11T12:00:00Z" };

function round(roundId: string, date: string, extra = {}) {
  return {
    roundId, jobId: 7, company: "Acme", role: "Engineer", stage: "INTERVIEW_STAGE", interviewDateTime: date,
    interviewEndDateTime: null, interviewType: "SYSTEM_DESIGN", meetingLink: null, location: null,
    interviewers: [{ name: "Sam Lee", linkedInUrl: null }], aiResults: {}, ...extra,
  };
}

const DETAIL = {
  jobId: 7, jdText: "Build caches.", interviewNotes: "", recommendedResume: "backend.pdf", notes: null,
  rejectedReason: null, links: [], aiResults: {},
};

const RESUMES = [
  { id: "r1", fileName: "backend.pdf", uploadedAt: "2026-01-01T00:00:00Z" },
  { id: "r2", fileName: "newest.pdf", uploadedAt: "2026-05-01T00:00:00Z" },
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("AI routes", () => {
  it("need a session", async () => {
    expect((await request().post("/ai/insights")).status).toBe(401);
  });

  it("say when the AI isn't set up, and save nothing", async () => {
    const calls = serve(["POST", /\/assist\/company-brief$/, 503, { error: "not_configured" }]);

    const res = await request().post("/ai/company-brief").set("Cookie", authCookie()).send({ company: "Acme" });

    expect(res.body).toEqual({ status: "not_configured" });
    expect(calls.some(c => c.method === "PUT")).toBe(false);
  });

  it("pass on a request the scraper refused", async () => {
    serve(["POST", /\/assist\/company-brief$/, 400, { error: "company is required" }]);

    const res = await request().post("/ai/company-brief").set("Cookie", authCookie()).send({ company: "Acme" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("company is required");
  });

  it("refuse an unknown kind to clear", async () => {
    expect((await request().delete("/ai/jobs/7/horoscope").set("Cookie", authCookie())).status).toBe(404);
    expect((await request().delete(`/ai/rounds/${ROUND}/tailoring`).set("Cookie", authCookie())).status).toBe(404);
  });

  it("clear a saved result in core", async () => {
    const calls = serve(["DELETE", /\/jobs\/7\/ai\/tailoring$/, 204, undefined]);

    const res = await request().delete("/ai/jobs/7/tailoring").set("Cookie", authCookie());

    expect(res.status).toBe(204);
    expect(calls).toHaveLength(1);
  });
});

describe("company brief", () => {
  it("reads nothing saved as no brief rather than an error", async () => {
    serve(["GET", /\/ai\/company-brief\?company=Acme%20Corp$/, 404, { error: "nothing saved yet" }]);

    const res = await request().get("/ai/company-brief?company=Acme Corp").set("Cookie", authCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ result: null });
  });

  it("researches the company and saves the brief under its name", async () => {
    const calls = serve(
      ["POST", /\/assist\/company-brief$/, 200, { overview: "Makes anvils." }],
      ["PUT", /\/ai\/company-brief\?company=Acme$/, 200, SAVED],
    );

    const res = await request().post("/ai/company-brief").set("Cookie", authCookie()).send({ company: " Acme ", role: "Engineer" });

    expect(res.body).toEqual({ status: "ok", result: SAVED });
    expect(sent(calls, "POST", /assist/)).toEqual({ company: "Acme", role: "Engineer" });
    expect(sent(calls, "PUT", /company-brief/)).toEqual({ content: { overview: "Makes anvils.", company: "Acme" } });
  });

  it("needs a company", async () => {
    expect((await request().post("/ai/company-brief").set("Cookie", authCookie()).send({ company: " " })).status).toBe(400);
    expect((await request().get("/ai/company-brief").set("Cookie", authCookie())).status).toBe(400);
  });
});

describe("interview prep and debrief", () => {
  function servePrep(rounds: unknown[]) {
    return serve(
      ["GET", /\/jobs\/7$/, 200, { id: 7, company: "Acme", role: "Engineer" }],
      ["GET", /\/interviews$/, 200, rounds],
      ["GET", /\/jobs\/7\/detail$/, 200, DETAIL],
      ["GET", /\/resumes$/, 200, RESUMES],
      ["GET", /\/resumes\/r1\/text$/, 200, { id: "r1", extractedText: "Ten years of caching." }],
      ["POST", /\/assist\/interview-prep$/, 200, { focus: "Design." }],
      ["PUT", /\/jobs\/7\/ai\/prep\?interviewType=SYSTEM_DESIGN$/, 200, SAVED],
    );
  }

  it("grounds prep in the job, the recommended resume, the rounds held, and the next one of its type", async () => {
    const calls = servePrep([round(ROUND, "2099-10-20T15:00:00Z"), round(EARLIER, "2026-01-01T15:00:00Z", { interviewType: "BEHAVIOR" })]);

    const res = await request().post("/ai/jobs/7/prep").set("Cookie", authCookie())
      .send({ interviewType: "SYSTEM_DESIGN", recruiterNotes: " 45 minutes, design a rate limiter. " });

    expect(res.body.status).toBe("ok");
    expect(sent(calls, "POST", /interview-prep/)).toMatchObject({
      company: "Acme", role: "Engineer", roundType: "system design", earlierRounds: ["behavior"],
      scheduledFor: "2099-10-20T15:00:00Z", interviewers: ["Sam Lee"], jobDescription: "Build caches.", resume: "Ten years of caching.",
      recruiterNotes: "45 minutes, design a rate limiter.",
    });
    // Kept, so the notes show with the prep and can be corrected for another run.
    expect(sent(calls, "PUT", /ai\/prep/)).toEqual({
      content: {
        focus: "Design.", interviewType: "SYSTEM_DESIGN", recruiterNotes: "45 minutes, design a rate limiter.", resumeFileName: "backend.pdf",
      },
    });
  });

  // Prep is wanted before the round is booked, which is when there's most time to use it.
  it("prepares for a kind of round nothing is scheduled for yet", async () => {
    const calls = servePrep([]);

    const res = await request().post("/ai/jobs/7/prep").set("Cookie", authCookie()).send({ interviewType: "SYSTEM_DESIGN" });

    expect(res.body.status).toBe("ok");
    expect(sent(calls, "POST", /interview-prep/)).toMatchObject({ scheduledFor: "", interviewers: [], earlierRounds: [], recruiterNotes: "" });
  });

  it("refuses an unknown kind of interview, or unusable notes, before anything is billed", async () => {
    for (const body of [
      {}, { interviewType: "ASTROLOGY" }, { interviewType: 3 },
      { interviewType: "BEHAVIOR", recruiterNotes: 42 }, { interviewType: "BEHAVIOR", recruiterNotes: "x".repeat(10_001) },
    ]) {
      expect((await request().post("/ai/jobs/7/prep").set("Cookie", authCookie()).send(body)).status).toBe(400);
    }
    expect((await request().delete("/ai/jobs/7/prep").set("Cookie", authCookie())).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("clears the prep for one kind of interview", async () => {
    const calls = serve(["DELETE", /\/jobs\/7\/ai\/prep\?interviewType=BEHAVIOR$/, 204, undefined]);

    const res = await request().delete("/ai/jobs/7/prep?interviewType=BEHAVIOR").set("Cookie", authCookie());

    expect(res.status).toBe(204);
    expect(calls).toHaveLength(1);
  });

  it("keeps the notes a debrief was made from", async () => {
    const calls = serve(
      ["GET", /\/interviews$/, 200, [round(ROUND, "2026-10-01T15:00:00Z")]],
      ["POST", /\/assist\/debrief$/, 200, { summary: "Went well.", thankYouNote: "Thanks!" }],
      ["PUT", /\/ai\/debrief$/, 200, SAVED],
    );

    await request().post(`/ai/rounds/${ROUND}/debrief`).set("Cookie", authCookie()).send({ notes: "Talked caching." });

    expect(sent(calls, "PUT", /ai\/debrief/)).toEqual({
      content: { summary: "Went well.", thankYouNote: "Thanks!", notes: "Talked caching." },
    });
  });

  it("needs notes for a debrief and a round that exists", async () => {
    serve(["GET", /\/interviews$/, 200, []]);

    expect((await request().post(`/ai/rounds/${ROUND}/debrief`).set("Cookie", authCookie()).send({})).status).toBe(400);
    expect((await request().post(`/ai/rounds/${ROUND}/debrief`).set("Cookie", authCookie()).send({ notes: "n" })).status).toBe(404);
    expect((await request().post("/ai/rounds/not-a-round/debrief").set("Cookie", authCookie()).send({ notes: "n" })).status).toBe(400);
  });
});

describe("job drafts", () => {
  it("follows up on the last round held, not one still ahead, using its debrief", async () => {
    const calls = serve(
      ["GET", /\/interviews$/, 200, [
        round(EARLIER, "2026-01-05T15:00:00Z", { aiResults: { debrief: { content: { summary: "Strong on caching." } } } }),
        round(ROUND, "2099-01-01T15:00:00Z"),
      ]],
      ["POST", /\/assist\/follow-up$/, 200, { subject: "Following up", body: "Hi." }],
      ["PUT", /\/jobs\/7\/ai\/follow-up$/, 200, SAVED],
    );

    const res = await request().post("/ai/jobs/7/follow-up").set("Cookie", authCookie());

    expect(res.body.status).toBe("ok");
    expect(sent(calls, "POST", /follow-up/)).toMatchObject({
      lastRound: { type: "system design", date: "2026-01-05" }, debriefSummary: "Strong on caching.",
    });
  });

  it("has nothing to follow up on before a round has happened", async () => {
    serve(["GET", /\/interviews$/, 200, [round(ROUND, "2099-01-01T15:00:00Z")]]);

    const res = await request().post("/ai/jobs/7/follow-up").set("Cookie", authCookie());

    expect(res.status).toBe(409);
  });

  it("negotiates from a current market check and only the competing offers still open", async () => {
    const offer = (jobId: number, outcome: string, extra = {}) => ({
      jobId, company: `Company ${jobId}`, role: "Engineer", outcome, offerTitle: "Engineer II", baseSalary: 150000,
      annualBonus: null, equityPerYear: null, equityByYear: [], signOnByYear: [], signOnPaidByYear: [], averagePerYear: 150000, averagedOverYears: 1, compByYear: [150000],
      decisionDeadline: null, notes: null, marketCheck: null, marketCheckStale: false, ...extra,
    });
    const check = { verdict: "below", typicalLow: 180000, typicalHigh: 200000, summary: "Low.", sources: [] };
    const calls = serve(
      ["GET", /\/offers$/, 200, [offer(7, "ACTIVE", { marketCheck: check }), offer(8, "ACTIVE"), offer(9, "OFFER_DECLINED")]],
      ["POST", /\/assist\/negotiation$/, 200, { subject: "Offer", body: "Hi.", asks: ["More base"] }],
      ["PUT", /\/jobs\/7\/ai\/negotiation$/, 200, SAVED],
    );

    await request().post("/ai/jobs/7/negotiation").set("Cookie", authCookie());

    const input = sent(calls, "POST", /negotiation/)!;
    expect(input).toMatchObject({ role: "Engineer II", postedRole: "Engineer", marketCheck: { verdict: "below" } });
    expect((input.otherOffers as { company: string }[]).map(o => o.company)).toEqual(["Company 8"]);
  });

  it("leaves out a market check the offer has since outgrown", async () => {
    const calls = serve(
      ["GET", /\/offers$/, 200, [{ jobId: 7, company: "Acme", role: "Engineer", outcome: "ACTIVE", offerTitle: null,
        equityByYear: [], marketCheck: { verdict: "at" }, marketCheckStale: true }]],
      ["POST", /\/assist\/negotiation$/, 200, { subject: "Offer", body: "Hi." }],
      ["PUT", /\/ai\/negotiation$/, 200, SAVED],
    );

    await request().post("/ai/jobs/7/negotiation").set("Cookie", authCookie());

    expect(sent(calls, "POST", /negotiation/)?.marketCheck).toBeNull();
  });

  it("tailors the resume chosen, and keeps which one it was", async () => {
    const calls = serve(
      ["GET", /\/jobs\/7$/, 200, { id: 7, company: "Acme", role: "Engineer" }],
      ["GET", /\/jobs\/7\/detail$/, 200, DETAIL],
      ["GET", /\/resumes$/, 200, RESUMES],
      ["GET", /\/resumes\/r2\/text$/, 200, { id: "r2", extractedText: "Newest resume." }],
      ["POST", /\/assist\/tailor-resume$/, 200, { summary: "Close." }],
      ["PUT", /\/jobs\/7\/ai\/tailoring$/, 200, SAVED],
    );

    await request().post("/ai/jobs/7/tailoring").set("Cookie", authCookie()).send({ resumeId: "r2" });

    expect(sent(calls, "POST", /tailor-resume/)).toMatchObject({ jobDescription: "Build caches.", resumeText: "Newest resume." });
    expect(sent(calls, "PUT", /tailoring/)).toEqual({ content: { summary: "Close.", resumeId: "r2", resumeFileName: "newest.pdf" } });
  });

  it("can't tailor without a description or a resume", async () => {
    serve(
      ["GET", /\/jobs\/7$/, 200, { id: 7, company: "Acme", role: "Engineer" }],
      ["GET", /\/jobs\/7\/detail$/, 200, { ...DETAIL, jdText: " " }],
      ["GET", /\/jobs\/8$/, 200, { id: 8, company: "Acme", role: "Engineer" }],
      ["GET", /\/jobs\/8\/detail$/, 200, DETAIL],
      ["GET", /\/resumes$/, 200, []],
    );

    const noDescription = await request().post("/ai/jobs/7/tailoring").set("Cookie", authCookie());
    const noResume = await request().post("/ai/jobs/8/tailoring").set("Cookie", authCookie());

    expect(noDescription.status).toBe(409);
    expect(noResume.status).toBe(409);
    expect(noResume.body.error).toContain("upload a resume");
  });

  // A resume picked by hand that can't be read is core's failure, or an unreadable file, never "you have none".
  it.each([
    [500, { error: "boom" }, 500],
    [200, { id: "r2", extractedText: " " }, 422],
  ])("says why the chosen resume couldn't be used when its text comes back %s", async (status, body, expected) => {
    const calls = serve(
      ["GET", /\/jobs\/7$/, 200, { id: 7, company: "Acme", role: "Engineer" }],
      ["GET", /\/jobs\/7\/detail$/, 200, DETAIL],
      ["GET", /\/resumes$/, 200, RESUMES],
      ["GET", /\/resumes\/r2\/text$/, status, body],
    );

    const res = await request().post("/ai/jobs/7/tailoring").set("Cookie", authCookie()).send({ resumeId: "r2" });

    expect(res.status).toBe(expected);
    expect(res.body.error).not.toContain("upload a resume");
    expect(sent(calls, "POST", /tailor-resume/)).toBeUndefined();
  });
});

describe("insights", () => {
  const job = (id: number, extra = {}) => ({
    id, company: `Secret Co ${id}`, role: "Engineer", sourceCategory: "SELF_APPLIED", currentStage: "FINALIZED",
    outcome: "ACTIVE", latestInterview: null, ...extra,
  });
  const metrics = {
    funnel: [{ stage: "RESUME_CHECK", count: 2 }], outcomeCounts: [{ outcome: "REJECTED", count: 1 }],
    interviewRoundCounts: [{ roundNode: "PANEL", count: 1, passed: 0, notPassed: 1,
      passedJobs: [], notPassedJobs: [{ jobId: 1, company: "Secret Co 1" }] }],
    sankeyPaths: [{ nodes: ["RESUME_CHECK", "INTERVIEW_REQUEST", "PANEL", "REJECTED"], jobs: 1,
      applications: [{ jobId: 1, company: "Secret Co 1", role: "Engineer", postings: 1 }] }],
  };

  const seasons: Route = ["GET", /\/seasons$/, 200, [{ id: 4, name: "This hunt", jobCount: 2, active: true }]];

  // Saved under the season read before the run, so switching seasons meanwhile can't misfile it.
  it("sends counts and rejection reasons, never company names", async () => {
    const calls = serve(
      seasons,
      ["GET", /\/jobs$/, 200, [
        job(1, { outcome: "REJECTED", latestInterview: { interviewType: "SYSTEM_DESIGN" } }),
        job(2, { sourceCategory: "REFERRAL_APPLIED", outcome: "OFFER_ACCEPTED", latestInterview: { interviewType: "BEHAVIOR" } }),
      ]],
      ["GET", /\/metrics$/, 200, metrics],
      ["GET", /\/jobs\/1\/detail$/, 200, { ...DETAIL, rejectedReason: "Wanted more Go." }],
      ["POST", /\/assist\/insights$/, 200, { summary: "Few offers." }],
      ["PUT", /\/ai\/insights\?season=4$/, 200, SAVED],
    );

    const res = await request().post("/ai/insights").set("Cookie", authCookie());

    expect(res.body.status).toBe("ok");
    const input = sent(calls, "POST", /assist\/insights/)!;
    expect(JSON.stringify(input)).not.toContain("Secret Co");
    expect(input.stats).toMatchObject({
      totalApplications: 2,
      roundsByType: [{ round: "panel", held: 1, passed: 0, notPassed: 1 }],
      byHowApplied: { SELF_APPLIED: { applied: 1, reachedInterview: 1, offers: 0 }, REFERRAL_APPLIED: { applied: 1, reachedInterview: 1, offers: 1 } },
      closedApplicationsStopped: { REJECTED: { "after a system design round": 1 } },
      rejectionReasons: ["Wanted more Go."],
    });
    expect(sent(calls, "PUT", /ai\/insights/)).toEqual({ content: { summary: "Few offers.", jobCount: 2 } });
  });

  it("needs some jobs to find patterns in", async () => {
    serve(seasons, ["GET", /\/jobs$/, 200, []]);

    expect((await request().post("/ai/insights").set("Cookie", authCookie())).status).toBe(409);
  });
});
