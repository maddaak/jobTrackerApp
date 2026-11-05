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

const settings = {
  emailConfigured: true, emailEnabled: true, email: "me@example.com", timeZone: "America/Chicago",
  digest: true, digestHour: 8, interviewSoon: true, offerDeadline: true, followUp: false,
};

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("/reminders", () => {
  it("needs a login for every route", async () => {
    for (const call of [request().get("/reminders/settings"), request().put("/reminders/settings"), request().post("/reminders/test")]) {
      expect((await call).status).toBe(401);
    }
  });

  it("reads and saves the caller's settings through core", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(fakeCoreResponse(200, settings));

    const read = await request().get("/reminders/settings").set("Cookie", authCookie("42"));
    const { emailConfigured: _, ...body } = settings;
    const saved = await request().put("/reminders/settings").set("Cookie", authCookie("42")).send(body);

    expect(read.body).toEqual(settings);
    expect(saved.body).toEqual(settings);
    const [url, init] = mockFetch.mock.calls[1];
    expect(url).toContain("/reminders/settings");
    expect(init).toMatchObject({ method: "PUT", headers: expect.objectContaining({ "X-User-Id": "42" }) });
    expect(JSON.parse(init.body)).toEqual(body);
  });

  it("lists the caller's follow-ups due from core", async () => {
    const due = [{ jobId: 3, company: "Initech", role: "Engineer", contactName: "Dana", contactRole: "RECRUITER", followUpOn: "2026-10-14" }];
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(fakeCoreResponse(200, due));

    const res = await request().get("/reminders/follow-ups").set("Cookie", authCookie("42"));

    expect(res.body).toEqual(due);
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/reminders\/follow-ups$/);
    expect(mockFetch.mock.calls[0][1].headers).toMatchObject({ "X-User-Id": "42" });
  });

  // The person needs core's reason (no SMTP settings, a refused login), not a generic failure.
  it("passes core's reason through when the test email can't be sent", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(503, { error: "email is not set up on this server: set SMTP_HOST and SMTP_FROM" }));

    const res = await request().post("/reminders/test").set("Cookie", authCookie());

    expect(res.status).toBe(503);
    expect(res.body.error).toContain("SMTP_HOST");
  });

  it("still hides other server errors and says plainly when core can't be reached", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(fakeCoreResponse(500, { error: "NullPointerException at ReminderService" }));
    mockFetch.mockRejectedValueOnce(new TypeError("fetch failed"));

    const crashed = await request().post("/reminders/test").set("Cookie", authCookie());
    const unreachable = await request().post("/reminders/test").set("Cookie", authCookie());

    expect(crashed.body).toEqual({ error: "internal error" });
    expect(unreachable.status).toBe(502);
    expect(unreachable.body).toEqual({ error: "internal error" });
  });
});
