import { describe, it, expect, vi, beforeEach } from "vitest";
import { request } from "../testServer.js";
import jwt from "jsonwebtoken";
import { authLimiter } from "../../src/middleware/rateLimiters.js";

const JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";

function fakeCoreResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  // One limiter serves every test in this file; rateLimiters.test.ts is where the limit itself is tested.
  for (const ip of ["127.0.0.1", "::ffff:127.0.0.1"]) authLimiter.resetKey(ip);
});

const NEW_ACCOUNT = { name: "Pat Lee", email: "pat@example.com", username: "alice", password: "Str0ng!Pass" };

describe("POST /auth/register", () => {
  it("sends the name and email to core, sets an httpOnly cookie, and never returns the token", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(200, { token: "signed.jwt.token", username: "alice" }),
    );

    // What nginx adds for a browser on https.
    const res = await request().post("/auth/register").set("X-Forwarded-Proto", "https").send(NEW_ACCOUNT);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: "alice" });
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual(NEW_ACCOUNT);

    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("token=signed.jwt.token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("returns 400 when any field is missing or not text, without calling core", async () => {
    for (const field of Object.keys(NEW_ACCOUNT)) {
      const res = await request().post("/auth/register").send({ ...NEW_ACCOUNT, [field]: 123 });
      expect(res.status, field).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proxies core's refusals (username taken, registration closed) through unchanged", async () => {
    for (const [status, error] of [[409, "username taken"], [403, "registration is closed"]] as const) {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(status, { error }));

      const res = await request().post("/auth/register").send(NEW_ACCOUNT);

      expect(res.status).toBe(status);
      expect(res.body).toEqual({ error });
      expect(res.headers["set-cookie"]).toBeUndefined();
    }
  });
});

describe("password reset", () => {
  // Whether the account exists must not show, but a down core shouldn't read as "email sent".
  it("answers a forgot-password request the same unless core is down", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(fakeCoreResponse(202, undefined));
    expect((await request().post("/auth/forgot-password").send({ username: "nobody" })).status).toBe(202);

    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await request().post("/auth/forgot-password").send({ username: "nobody" })).status).toBe(502);
  });

  it("passes core's reason through when a reset link is no good", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(400, { error: "this reset link is invalid or has expired: ask for a new one" }));

    const res = await request().post("/auth/reset-password").send({ token: "abc", newPassword: "N3w!Password" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("expired");
  });

  // Reachable only from the terminal script, inside the container.
  it("gives a browser no way to ask for a temporary password", async () => {
    const res = await request().post("/auth/temporary-password").send({ username: "alice" });

    expect(res.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("POST /auth/login", () => {
  it("sets the cookie on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(200, { token: "signed.jwt.token", username: "carol" }),
    );

    const res = await request()
      .post("/auth/login")
      .send({ username: "carol", password: "Str0ng!Pass" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: "carol" });
    expect(res.headers["set-cookie"]?.[0]).toContain("token=signed.jwt.token");
  });

  // Plain http on localhost, run without a certificate: a Secure cookie there could be dropped.
  it("leaves the cookie unsecured only when the browser came in over http", async () => {
    for (const [proto, secure] of [["https", true], ["http", false]] as const) {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        fakeCoreResponse(200, { token: "signed.jwt.token", username: "carol" }),
      );

      const res = await request().post("/auth/login").set("X-Forwarded-Proto", proto)
        .send({ username: "carol", password: "Str0ng!Pass" });

      expect(res.headers["set-cookie"]?.[0].includes("Secure"), proto).toBe(secure);
    }
  });

  it("returns 400 when both fields are missing without calling core", async () => {
    const res = await request().post("/auth/login").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "username and password are required" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proxies core's 401 through unchanged", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(401, { error: "invalid username or password" }),
    );

    const res = await request()
      .post("/auth/login")
      .send({ username: "carol", password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid username or password" });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("POST /auth/logout", () => {
  it("clears the cookie", async () => {
    const res = await request().post("/auth/logout");

    expect(res.status).toBe(200);
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("token=;");
  });
});

describe("GET /auth/me (requireAuth)", () => {
  it("returns 401 with no cookie at all", async () => {
    const res = await request().get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a garbage token", async () => {
    const res = await request().get("/auth/me").set("Cookie", "token=not-a-real-jwt");
    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const expired = jwt.sign({ sub: "1", username: "dave" }, JWT_SECRET, { expiresIn: -10, algorithm: "HS512" });
    const res = await request().get("/auth/me").set("Cookie", `token=${expired}`);
    expect(res.status).toBe(401);
  });

  it("returns 401 for a correctly signed token that carries no user id", async () => {
    const noSub = jwt.sign({ username: "frank" }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" });
    const res = await request().get("/auth/me").set("Cookie", `token=${noSub}`);
    expect(res.status).toBe(401);
  });

  it("returns 200 with the username for a valid token on a current session", async () => {
    const valid = jwt.sign({ sub: "1", username: "erin" }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" });
    const res = await request().get("/auth/me").set("Cookie", `token=${valid}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: "erin" });
  });
});
