import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { request } from "../testServer.js";

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
      const res = await request().post("/auth/login").send(credentials);
      expect(res.status).toBe(200);
    }

    const res = await request().post("/auth/login").send(credentials);
    expect(res.status).toBe(429);
    expect(res.body.error).toBe("too many sign-in attempts from here; try again in 15 minutes");
  });

  // An email change checks the current password, so guessing through it shares login's count; a name change doesn't.
  it("counts an email change against the same limit, and leaves a name change alone", async () => {
    const token = jwt.sign({ sub: "1", username: "flooder" }, process.env.JWT_SECRET as string, { algorithm: "HS512" });
    const cookie = `token=${token}`;

    const guess = await request().put("/account").set("Cookie", cookie)
      .send({ name: "Pat", email: "new@example.com", currentPassword: "guess" });
    const rename = await request().put("/account").set("Cookie", cookie).send({ name: "Pat", email: "pat@example.com" });

    // The login test above used up this address's ten.
    expect(guess.status).toBe(429);
    expect(rename.status).toBe(200);
  });
});

describe("a ceiling on the app itself, far above real use", () => {
  // The old 100 per 15 minutes blocked the owner after ~20 card opens; ordinary use must never meet this one.
  it("never answers 429 to ordinary use", async () => {
    // An app route; no cookie, so each answers 401 fast.
    const statuses = new Set<number>();
    for (let i = 0; i < 150; i++) {
      statuses.add((await request().get("/jobs")).status);
    }
    expect(statuses).toEqual(new Set([401]));
  });

  // 600 a minute by default (REQUESTS_PER_MINUTE), counting the requests above.
  it("stops a flood with a reason, and leaves the health check alone", async () => {
    let sent = 0;
    let res = await request().get("/jobs");
    while (res.status !== 429 && sent < 700) {
      sent++;
      res = await request().get("/jobs");
    }

    expect(res.status).toBe(429);
    expect(res.body.error).toBe("too many requests; slow down and try again in a minute");
    expect((await request().get("/health")).status).toBe(200);
  });
});
