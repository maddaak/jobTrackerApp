import { describe, it, expect, vi } from "vitest";
import type { Response } from "express";
import jwt from "jsonwebtoken";

// Read when config loads, so it's set before the client is imported.
process.env.AI_DAILY_LIMIT = "2";
const { analyzeResume } = await import("../../src/services/scraperAnalysisClient.js");
const { requireAuth } = await import("../../src/middleware/requireAuth.js");
const { checkOfferMarket } = await import("../../src/services/offerMarketCheck.js");
const { compareUndecidedOffers } = await import("../../src/services/offerComparison.js");
const { summarizeResume } = await import("../../src/services/resumeAnalysis.js");
const { matchJobToResumes } = await import("../../src/services/resumeMatching.js");
const { runAndSave } = await import("../../src/services/aiAssists.js");
type AuthedRequest = import("../../src/middleware/requireAuth.js").AuthedRequest;
const JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";

const answer = (status: number, body: unknown) => ({ ok: status < 400, status, json: () => Promise.resolve(body) });

describe("the daily AI limit", () => {
  // Every account spends the owner's key, so a stolen session or a loop can only spend so much in a day.
  // Core keeps the count; the bff asks it first and never reaches the provider once it says no.
  it("asks core before each AI call and stops when core says the day is used up", async () => {
    let counted = 0;
    const mockFetch = vi.fn((url: string) => {
      if (url.includes("/ai-usage")) {
        return Promise.resolve(++counted <= 2 ? answer(204, undefined)
          : answer(429, { error: "the daily limit of 2 AI calls is used up; it resets at midnight UTC (AI_DAILY_LIMIT in .env)" }));
      }
      return Promise.resolve(answer(200, { summary: "ok" }));
    });
    vi.stubGlobal("fetch", mockFetch);

    expect((await analyzeResume("resume text")).status).toBe("ok");
    expect((await analyzeResume("resume text")).status).toBe("ok");
    const third = await analyzeResume("resume text");

    expect(third).toEqual({
      status: "rejected",
      error: "the daily limit of 2 AI calls is used up; it resets at midnight UTC (AI_DAILY_LIMIT in .env)",
      // A 429 to the page, so "try tomorrow" isn't read as a bad request.
      httpStatus: 429,
    });
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/ai-usage\?limit=2$/);
    expect(mockFetch.mock.calls.filter(([url]) => !url.includes("/ai-usage"))).toHaveLength(2);
  });

  // Sent as the signed-in user, so core's session check refuses a signed-out session before anything is billed.
  it("asks core as the signed-in session, and makes no AI call when core refuses it", async () => {
    const mockFetch = vi.fn().mockResolvedValue(answer(401, { error: "this session was signed out; sign in again" }));
    vi.stubGlobal("fetch", mockFetch);
    const cookies = { token: jwt.sign({ sub: "7", username: "alice", ver: 1 }, JWT_SECRET, { algorithm: "HS512" }) };

    const result = await new Promise(resolve =>
      requireAuth({ cookies } as AuthedRequest, {} as Response, () => resolve(analyzeResume("resume text"))));

    expect(result).toEqual({ status: "unavailable" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1].headers).toMatchObject({ "X-User-Id": "7", "X-Session-Version": "1" });
  });

  // Without core there's no knowing whether the day has room, so nothing is spent.
  it("makes no AI call when core can't be asked", async () => {
    const mockFetch = vi.fn().mockResolvedValue(answer(502, {}));
    vi.stubGlobal("fetch", mockFetch);

    expect(await analyzeResume("resume text")).toEqual({ status: "unavailable" });
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  // Each feature turns the refusal into its own answer; every one must keep it a 429, not a bad request.
  const offer = (jobId: number) => ({
    jobId, company: `Company ${jobId}`, role: "Engineer", location: null, outcome: "ACTIVE", offerTitle: null,
    baseSalary: 150000, bonusAmount: null, bonusPercent: null, equityGrant: 100000, vestingYears: 4,
    vestingSchedule: [25, 25, 25, 25], vestedShares: null, signOnBonus: null, signOnByYear: [], signOnPaidByYear: [],
    annualBonus: null, equityByYear: [25000, 25000, 25000, 25000], equityPerYear: 25000, averagePerYear: 175000,
    averagedOverYears: 4, compByYear: [175000, 175000, 175000, 175000], startDate: null, decisionDeadline: null, notes: null,
  });
  it.each([
    ["the offer market check", () => checkOfferMarket("1", "3")],
    ["the offer comparison", () => compareUndecidedOffers("1", "remote work")],
    ["the resume summary", () => summarizeResume("1", "r1")],
    ["the resume match", () => matchJobToResumes("1", "Build caches.")],
    ["every saved assist", () => runAndSave("company-brief", { company: "Acme" }, vi.fn())],
  ])("answers %s with a 429 once the day is used up", async (_, run) => {
    const mockFetch = vi.fn((url: string) => Promise.resolve(
      url.includes("/ai-usage") ? answer(429, { error: "the daily limit of 2 AI calls is used up" })
        : url.includes("/seasons") ? answer(200, [{ id: 4, name: "Hunt", createdAt: "2026-10-20T12:00:00Z", jobCount: 2, active: true }])
          : url.includes("/offers") ? answer(200, [offer(3), offer(4)])
            : url.includes("/resumes/r1/text") ? answer(200, { id: "r1", extractedText: "Ten years of caching." })
              : url.includes("/resumes") ? answer(200, [{ id: "r1", fileName: "a.pdf", analysisStatus: "ok", summary: "Caching." }])
                : answer(500, {})));
    vi.stubGlobal("fetch", mockFetch);

    expect(await run()).toEqual({ status: "error", httpStatus: 429, error: "the daily limit of 2 AI calls is used up" });
    expect(mockFetch.mock.calls.some(([url]) => url.includes("/assist") || url.includes("/analyze"))).toBe(false);
  });
});
