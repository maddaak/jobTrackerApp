import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";

const JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";

function fakeCoreResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("POST /auth/register", () => {
  it("sets an httpOnly cookie and never returns the token in the body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(200, { token: "signed.jwt.token", username: "alice" }),
    );

    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "Str0ng!Pass" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: "alice" });
    expect(res.body.token).toBeUndefined();

    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("token=signed.jwt.token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("returns 400 when the password is missing without calling core", async () => {
    const res = await request(app).post("/auth/register").send({ username: "alice" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "username and password are required" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when username is not a string", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ username: 123, password: "Str0ng!Pass" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "username and password are required" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proxies core's 409 (username taken) through unchanged", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(409, { error: "username taken" }),
    );

    const res = await request(app)
      .post("/auth/register")
      .send({ username: "bob", password: "Str0ng!Pass" });

    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: "username taken" });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("POST /auth/login", () => {
  it("sets the cookie on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(200, { token: "signed.jwt.token", username: "carol" }),
    );

    const res = await request(app)
      .post("/auth/login")
      .send({ username: "carol", password: "Str0ng!Pass" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: "carol" });
    expect(res.headers["set-cookie"]?.[0]).toContain("token=signed.jwt.token");
  });

  it("returns 400 when both fields are missing without calling core", async () => {
    const res = await request(app).post("/auth/login").send({});

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "username and password are required" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proxies core's 401 through unchanged", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(401, { error: "invalid username or password" }),
    );

    const res = await request(app)
      .post("/auth/login")
      .send({ username: "carol", password: "wrong" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "invalid username or password" });
    expect(res.headers["set-cookie"]).toBeUndefined();
  });
});

describe("POST /auth/logout", () => {
  it("clears the cookie", async () => {
    const res = await request(app).post("/auth/logout");

    expect(res.status).toBe(200);
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toContain("token=;");
  });
});

describe("GET /auth/me (requireAuth)", () => {
  it("returns 401 with no cookie at all", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 401 for a garbage token", async () => {
    const res = await request(app).get("/auth/me").set("Cookie", "token=not-a-real-jwt");
    expect(res.status).toBe(401);
  });

  it("returns 401 for an expired token", async () => {
    const expired = jwt.sign({ sub: "1", username: "dave" }, JWT_SECRET, { expiresIn: -10, algorithm: "HS512" });
    const res = await request(app).get("/auth/me").set("Cookie", `token=${expired}`);
    expect(res.status).toBe(401);
  });

  it("returns 200 with the username for a valid token", async () => {
    const valid = jwt.sign({ sub: "1", username: "erin" }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" });
    const res = await request(app).get("/auth/me").set("Cookie", `token=${valid}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ username: "erin" });
  });
});
