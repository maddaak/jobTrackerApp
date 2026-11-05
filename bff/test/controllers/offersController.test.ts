import { describe, it, expect, vi, beforeEach } from "vitest";
import { request } from "../testServer.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";

function authCookie(userId = "1", username = "alice") {
  const token = jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" });
  return `token=${token}`;
}

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

function offer(jobId: number, outcome: string) {
  return {
    jobId, company: `Company ${jobId}`, role: "Engineer", location: null, outcome, offerTitle: null as string | null,
    baseSalary: 150000, bonusAmount: null, bonusPercent: null, equityGrant: 100000, vestingYears: 4,
    vestingSchedule: [5, 15, 40, 40], vestedShares: null, signOnBonus: null, signOnByYear: [30000, 20000], signOnPaidByYear: [30000, 20000], annualBonus: null,
    equityByYear: [5000, 15000, 40000, 40000], equityPerYear: 25000, averagePerYear: 187500, averagedOverYears: 4,
    compByYear: [185000, 185000, 190000, 190000], startDate: null, decisionDeadline: null, notes: null,
  };
}

const fetchMock = () => fetch as ReturnType<typeof vi.fn>;

const SAVED_AT = "2026-10-20T12:00:00Z";
const COMPARISON = {
  status: "ok",
  recommendedJobId: 3,
  summary: "Company 3 fits the priorities.",
  assessments: [{ jobId: 3, pros: ["remote"], cons: [], negotiationPoints: ["ask for more equity"] }],
  priorities: "remote work",
};

// The season on screen when a comparison starts, which its answer is saved under.
const SEASONS = fakeResponse(200, [{ id: 4, name: "This hunt", createdAt: SAVED_AT, jobCount: 3, active: true }]);

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("GET /offers", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request().get("/offers");
    expect(res.status).toBe(401);
  });

  it("returns the caller's offers from core", async () => {
    fetchMock().mockResolvedValueOnce(fakeResponse(200, [offer(1, "ACTIVE")]));

    const res = await request().get("/offers").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([offer(1, "ACTIVE")]);
    expect(fetchMock()).toHaveBeenCalledWith(
      expect.stringContaining("/offers"),
      expect.objectContaining({ headers: expect.objectContaining({ "X-User-Id": "42" }) }),
    );
  });
});

describe("PUT /jobs/:id/offer", () => {
  it("passes core's 409 through when the job has no offer", async () => {
    fetchMock().mockResolvedValueOnce(fakeResponse(409, { error: "this job has no offer" }));

    const res = await request().put("/jobs/7/offer").set("Cookie", authCookie()).send({ baseSalary: 1 });

    expect(res.status).toBe(409);
    expect(fetchMock()).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/7/offer"),
      expect.objectContaining({ method: "PUT" }),
    );
  });
});

describe("POST /jobs/:id/offer/market-check", () => {
  const check = {
    verdict: "below", typicalLow: 180000, typicalHigh: 220000, summary: "Surveys put it higher.",
    negotiationPoints: ["Ask for more base."], searched: true, sources: [{ title: "Pay data", url: "https://pay.example/a" }],
  };

  it("checks the offer's own numbers, saves the result with it, and returns the offer", async () => {
    const placed = { ...offer(7, "ACTIVE"), location: "HYBRID", city: "Toronto" };
    const saved = { ...placed, marketCheck: { ...check, checkedAt: "2026-10-09T12:00:00Z" } };
    fetchMock()
      .mockResolvedValueOnce(fakeResponse(200, [offer(3, "ACTIVE"), placed]))
      .mockResolvedValueOnce(fakeResponse(200, check))
      .mockResolvedValueOnce(fakeResponse(200, saved));

    const res = await request().post("/jobs/7/offer/market-check").set("Cookie", authCookie());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", offer: saved });
    const asked = JSON.parse(fetchMock().mock.calls[1][1].body);
    // Words a search can use, not the app's location code.
    expect(asked).toMatchObject({
      company: "Company 7", role: "Engineer", postedRole: "", location: "Hybrid, Toronto", baseSalary: 150000,
      // A sign-on over two years is priced as its total, which the AI is told not to count as yearly pay.
      signOnTotal: 50000,
    });
    expect(fetchMock().mock.calls[2][0]).toContain("/jobs/7/offer/market-check");
    expect(JSON.parse(fetchMock().mock.calls[2][1].body)).toEqual(check);
  });

  // A downlevel is priced at the title offered, with the posting's title there to say so.
  it("checks the title offered when it differs from the posting", async () => {
    const downleveled = { ...offer(7, "ACTIVE"), offerTitle: "Engineer II" };
    fetchMock()
      .mockResolvedValueOnce(fakeResponse(200, [downleveled]))
      .mockResolvedValueOnce(fakeResponse(200, check))
      .mockResolvedValueOnce(fakeResponse(200, downleveled));

    await request().post("/jobs/7/offer/market-check").set("Cookie", authCookie());

    expect(JSON.parse(fetchMock().mock.calls[1][1].body)).toMatchObject({ role: "Engineer II", postedRole: "Engineer" });
  });

  it("removes a check through core without asking the AI", async () => {
    fetchMock().mockResolvedValueOnce(fakeResponse(200, offer(7, "ACTIVE")));

    const res = await request().delete("/jobs/7/offer/market-check").set("Cookie", authCookie());

    expect(res.status).toBe(200);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(fetchMock().mock.calls[0][0]).toContain("/jobs/7/offer/market-check");
    expect(fetchMock().mock.calls[0][1]).toMatchObject({ method: "DELETE" });
  });

  it("doesn't ask the AI about a job with no offer", async () => {
    fetchMock().mockResolvedValueOnce(fakeResponse(200, [offer(3, "ACTIVE")]));

    const res = await request().post("/jobs/7/offer/market-check").set("Cookie", authCookie());

    expect(res.status).toBe(404);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it("saves nothing when the AI is unavailable", async () => {
    fetchMock()
      .mockResolvedValueOnce(fakeResponse(200, [offer(7, "ACTIVE")]))
      .mockResolvedValueOnce(fakeResponse(502, { error: "unavailable" }));

    const res = await request().post("/jobs/7/offer/market-check").set("Cookie", authCookie());

    expect(res.body).toEqual({ status: "unavailable" });
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });
});

describe("POST /offers/compare", () => {
  it("rejects priorities that are not text", async () => {
    const res = await request().post("/offers/compare").set("Cookie", authCookie()).send({ priorities: 5 });

    expect(res.status).toBe(400);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("refuses when every offer is already decided", async () => {
    fetchMock().mockResolvedValueOnce(SEASONS).mockResolvedValueOnce(fakeResponse(200, [offer(1, "OFFER_ACCEPTED")]));

    const res = await request().post("/offers/compare").set("Cookie", authCookie()).send({});

    expect(res.status).toBe(409);
  });

  it("sends only undecided offers, maps the ids back to jobs, and saves the answer", async () => {
    fetchMock()
      .mockResolvedValueOnce(SEASONS)
      .mockResolvedValueOnce(fakeResponse(200, [offer(1, "ACTIVE"), offer(2, "OFFER_DECLINED"), offer(3, "ACTIVE")]))
      .mockResolvedValueOnce(fakeResponse(200, {
        recommendedOfferId: "3",
        summary: "Company 3 fits the priorities.",
        offers: [{ id: "3", pros: ["remote"], cons: [], negotiationPoints: ["ask for more equity"] }],
      }))
      .mockResolvedValueOnce(fakeResponse(200, { content: {}, createdAt: SAVED_AT }));

    const res = await request().post("/offers/compare").set("Cookie", authCookie())
      .send({ priorities: "remote work" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...COMPARISON, createdAt: SAVED_AT, stale: false });
    const scraperBody = JSON.parse(fetchMock().mock.calls[2][1].body);
    expect(scraperBody.priorities).toBe("remote work");
    expect(scraperBody.offers.map((o: { id: string }) => o.id)).toEqual(["1", "3"]);
    // A back-loaded grant is worth less in year one than its average says; the AI needs to see that.
    expect(scraperBody.offers[0]).toMatchObject({ equityPerYear: 25000, equityByYear: [5000, 15000, 40000, 40000] });
    // Saved for the season shown when it started, with what the AI was told, so a later visit can tell if the
    // offers changed.
    expect(fetchMock().mock.calls[3][0]).toMatch(/\/ai\/offer-comparison\?season=4$/);
    const saved = JSON.parse(fetchMock().mock.calls[3][1].body).content;
    expect(saved).toMatchObject({ recommendedJobId: 3, priorities: "remote work" });
    expect(JSON.parse(saved.basis).map((o: { id: string }) => o.id)).toEqual(["1", "3"]);
  });

  it("answers with no assessments, not a 500, when the comparison leaves the list out", async () => {
    fetchMock()
      .mockResolvedValueOnce(SEASONS)
      .mockResolvedValueOnce(fakeResponse(200, [offer(1, "ACTIVE")]))
      .mockResolvedValueOnce(fakeResponse(200, { recommendedOfferId: "1", summary: "Take it." }))
      .mockResolvedValueOnce(fakeResponse(200, { content: {}, createdAt: SAVED_AT }));

    const res = await request().post("/offers/compare").set("Cookie", authCookie()).send({});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", recommendedJobId: 1, assessments: [] });
  });

  it("passes the scraper's refusal through as a 400 with its reason, not as unavailable", async () => {
    fetchMock()
      .mockResolvedValueOnce(SEASONS)
      .mockResolvedValueOnce(fakeResponse(200, [offer(1, "ACTIVE")]))
      .mockResolvedValueOnce(fakeResponse(400, { error: "too many offers" }));

    const res = await request().post("/offers/compare").set("Cookie", authCookie()).send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "too many offers" });
  });

  it("reports not_configured when the scraper has no API key", async () => {
    fetchMock()
      .mockResolvedValueOnce(SEASONS)
      .mockResolvedValueOnce(fakeResponse(200, [offer(1, "ACTIVE")]))
      .mockResolvedValueOnce(fakeResponse(503, { error: "not_configured" }));

    const res = await request().post("/offers/compare").set("Cookie", authCookie()).send({});

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "not_configured" });
  });
});

describe("GET /offers/compare", () => {
  // What a run sends to core, so these tests read back exactly what one would have saved.
  async function savedRun(offers: unknown[]) {
    fetchMock()
      .mockResolvedValueOnce(SEASONS)
      .mockResolvedValueOnce(fakeResponse(200, offers))
      .mockResolvedValueOnce(fakeResponse(200, {
        recommendedOfferId: "3", summary: "Company 3 fits the priorities.",
        offers: [{ id: "3", pros: ["remote"], cons: [], negotiationPoints: ["ask for more equity"] }],
      }))
      .mockResolvedValueOnce(fakeResponse(200, { content: {}, createdAt: SAVED_AT }));
    await request().post("/offers/compare").set("Cookie", authCookie()).send({ priorities: "remote work" });
    const content = JSON.parse(fetchMock().mock.calls[3][1].body).content;
    fetchMock().mockReset();
    return { content, createdAt: SAVED_AT };
  }

  it("answers null when nothing has been compared in this season", async () => {
    fetchMock().mockResolvedValueOnce(fakeResponse(404, { error: "nothing saved yet" }));

    const res = await request().get("/offers/compare").set("Cookie", authCookie());

    expect(res.body).toEqual({ comparison: null });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  // Seeing it again is free; only a new comparison asks the AI.
  it("returns the saved comparison without asking the AI, fresh while the offers are unchanged", async () => {
    const offers = [offer(1, "ACTIVE"), offer(3, "ACTIVE")];
    const saved = await savedRun(offers);
    fetchMock().mockResolvedValueOnce(fakeResponse(200, saved)).mockResolvedValueOnce(fakeResponse(200, offers));

    const res = await request().get("/offers/compare").set("Cookie", authCookie());

    expect(res.body).toEqual({ comparison: { ...COMPARISON, createdAt: SAVED_AT, stale: false } });
    expect(fetchMock().mock.calls.some(([url]) => /compare-offers/.test(url))).toBe(false);
  });

  it("says the saved comparison is stale once an offer is edited, decided, or added", async () => {
    const offers = [offer(1, "ACTIVE"), offer(3, "ACTIVE")];
    const saved = await savedRun(offers);
    for (const now of [
      [{ ...offer(1, "ACTIVE"), baseSalary: 160000 }, offer(3, "ACTIVE")],
      [offer(1, "OFFER_DECLINED"), offer(3, "ACTIVE")],
      [...offers, offer(4, "ACTIVE")],
    ]) {
      fetchMock().mockResolvedValueOnce(fakeResponse(200, saved)).mockResolvedValueOnce(fakeResponse(200, now));

      const res = await request().get("/offers/compare").set("Cookie", authCookie());

      expect(res.body.comparison.stale).toBe(true);
    }
  });
});
