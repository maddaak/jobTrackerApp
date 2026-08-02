import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";

const JWT_SECRET = "test-secret-not-for-production";

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
    const res = await request(app).get("/metrics");
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

    const res = await request(app).get("/metrics").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(metrics);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/metrics"),
      expect.objectContaining({ headers: expect.objectContaining({ "X-User-Id": "42" }) }),
    );
  });
});
