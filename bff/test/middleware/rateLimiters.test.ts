import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ token: "signed.jwt.token", username: "flooder" }),
    }),
  );
});

describe("rate limiting on /auth/*", () => {
  it("returns 429 once the auth limiter's threshold is exceeded", async () => {
    const credentials = { username: "flooder", password: "Str0ng!Pass" };

    // authLimiter allows 10 per window (src/middleware/rateLimiters.ts).
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post("/auth/login").send(credentials);
      expect(res.status).toBe(200);
    }

    const res = await request(app).post("/auth/login").send(credentials);
    expect(res.status).toBe(429);
  });
});
