import { describe, it, expect, vi, beforeEach } from "vitest";
import { request } from "../testServer.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";

function authCookie(userId = "1", username = "alice") {
  const token = jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" });
  return `token=${token}`;
}

function fakeCoreResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("GET /metrics", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request().get("/metrics");
    expect(res.status).toBe(401);
  });

  it("returns the caller's metrics", async () => {
    const metrics = {
      funnel: [{ stage: "RESUME_CHECK", count: 3 }],
      outcomeCounts: [{ outcome: "REJECTED", count: 1 }],
      interviewRoundCounts: [{ interviewType: "SYSTEM_DESIGN", count: 2 }],
      sankeyLinks: [],
    };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, metrics));

    const res = await request().get("/metrics").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(metrics);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/metrics"),
      expect.objectContaining({ headers: expect.objectContaining({ "X-User-Id": "42" }) }),
    );
  });

  it("returns each season's numbers for the Seasons page", async () => {
    const stats = [{ seasonId: 1, applications: 9, active: 3, heardBack: 4, interviewed: 2, offers: 1,
      firstApplied: "2026-01-02T00:00:00Z", lastApplied: "2026-03-04T00:00:00Z" }];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, stats));

    const res = await request().get("/metrics/seasons").set("Cookie", authCookie("42"));

    expect(res.body).toEqual(stats);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatch(/\/metrics\/seasons$/);
  });
});
