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

describe("/account", () => {
  it("needs a login", async () => {
    expect((await request().get("/account")).status).toBe(401);
    expect((await request().put("/account/password")).status).toBe(401);
  });

  it("reads and updates the caller's own account", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    const account = { username: "alice", name: "Pat Lee", email: "pat@example.com" };
    mockFetch.mockResolvedValue(fakeCoreResponse(200, account));

    expect((await request().get("/account").set("Cookie", authCookie("42"))).body).toEqual(account);
    await request().put("/account").set("Cookie", authCookie("42"))
      .send({ name: "Pat Lee", email: "new@example.com", currentPassword: "Str0ng!Pass", extra: 1 });

    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toContain("/account");
    expect(init).toMatchObject({ method: "PUT", headers: expect.objectContaining({ "X-User-Id": "42" }) });
    // The password goes along, since core asks for it before moving the email reset links go to.
    expect(JSON.parse(init.body)).toEqual({ name: "Pat Lee", email: "new@example.com", currentPassword: "Str0ng!Pass" });
  });

  it("downloads core's backup as a file", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true, status: 200,
      headers: new Headers({ "content-type": "application/json", "content-disposition": "attachment; filename=\"job-tracker-backup-2026-10-11.json\"" }),
      arrayBuffer: () => Promise.resolve(new TextEncoder().encode("{\"format\":\"job-tracker-backup\"}").buffer),
    });

    const res = await request().get("/account/export").set("Cookie", authCookie());

    expect(res.status).toBe(200);
    expect(res.headers["content-disposition"]).toContain("job-tracker-backup-2026-10-11.json");
    expect(res.text).toBe("{\"format\":\"job-tracker-backup\"}");
  });

  it("passes the uploaded backup's bytes to core and core's refusal back", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(fakeCoreResponse(409, { error: "restore only into an account with no jobs or resumes yet" }));
    const file = Buffer.from("{\"format\":\"job-tracker-backup\",\"jobs\":[]}");

    const res = await request().post("/account/restore").set("Cookie", authCookie("42")).attach("file", file, "backup.json");

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("no jobs");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain("/account/restore");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json", "X-User-Id": "42" });
    expect(Buffer.from(init.body).toString()).toBe(file.toString());
  });

  it("asks for a file when none is attached", async () => {
    const res = await request().post("/account/restore").set("Cookie", authCookie());

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  // Core answers a wrong current password with 400, not 401, so the page doesn't log them out.
  it("passes a wrong current password back as 400", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(400, { error: "current password is incorrect" }));

    const res = await request().put("/account/password").set("Cookie", authCookie())
      .send({ currentPassword: "nope", newPassword: "N3w!Password" });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe("current password is incorrect");
  });

  // Core ends every session on a new password or "sign out other devices"; this one carries on with the
  // token core sends back, so the person doing it isn't signed out too.
  it("keeps the session that changed the password, or signed out the others, signed in", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(fakeCoreResponse(200, { token: "fresh.jwt.token", username: "alice" }));

    for (const call of [
      request().put("/account/password").send({ currentPassword: "Old!Passw0rd", newPassword: "N3w!Password" }),
      request().post("/account/sessions/end-others"),
    ]) {
      const res = await call.set("Cookie", authCookie("42"));
      expect(res.status).toBe(200);
      expect(res.headers["set-cookie"][0]).toMatch(/^token=fresh\.jwt\.token;.*HttpOnly/);
    }
    expect(mockFetch.mock.calls[1][0]).toMatch(/\/account\/sessions\/end-others$/);
  });

  // The version the token was signed with goes to core, which refuses one a newer password has replaced.
  it("tells core which session version the token carries, 0 for a token from before versions", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(fakeCoreResponse(200, {}));
    const versioned = jwt.sign({ sub: "42", username: "alice", ver: 3 }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" });

    await request().get("/account").set("Cookie", `token=${versioned}`);
    await request().get("/account").set("Cookie", authCookie("42"));

    expect(mockFetch.mock.calls[0][1].headers).toMatchObject({ "X-User-Id": "42", "X-Session-Version": "3" });
    expect(mockFetch.mock.calls[1][1].headers).toMatchObject({ "X-Session-Version": "0" });
  });

  it("passes core's refusal of a signed-out session back as 401", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(401, { error: "this session was signed out; sign in again" }));

    const res = await request().get("/account").set("Cookie", authCookie());

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("this session was signed out; sign in again");
  });

  it("loads, counts, and removes the sample for the signed-in account, passing core's refusal on", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch
      .mockResolvedValueOnce(fakeCoreResponse(200, { jobs: 22 }))
      .mockResolvedValueOnce(fakeCoreResponse(409, { error: "sample data goes only into an account with no jobs yet" }))
      .mockResolvedValueOnce(fakeCoreResponse(200, { jobs: 22 }))
      .mockResolvedValueOnce(fakeCoreResponse(200, { removed: 22 }));

    expect((await request().post("/account/sample").set("Cookie", authCookie("42"))).body).toEqual({ jobs: 22 });
    expect((await request().post("/account/sample").set("Cookie", authCookie("42"))).status).toBe(409);
    expect((await request().get("/account/sample").set("Cookie", authCookie("42"))).body).toEqual({ jobs: 22 });
    expect((await request().delete("/account/sample").set("Cookie", authCookie("42"))).body).toEqual({ removed: 22 });

    expect(mockFetch.mock.calls.map(([url, init]) => [new URL(url).pathname, init.method ?? "GET", init.headers["X-User-Id"]]))
      .toEqual([
        ["/account/sample", "POST", "42"], ["/account/sample", "POST", "42"],
        ["/account/sample", "GET", "42"], ["/account/sample", "DELETE", "42"],
      ]);
  });
});
