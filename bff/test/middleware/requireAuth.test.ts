import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { request } from "../testServer.js";
import { checkSession } from "../../src/services/accountClient.js";

const token = jwt.sign({ sub: "1", username: "alice", ver: 0 }, process.env.JWT_SECRET as string, { algorithm: "HS512" });

// One per signed-in router, plus the routes that check per route; the scraper and GitHub ones never reach core.
const SIGNED_IN_ROUTES: ["get" | "post", string][] = [
  ["get", "/auth/me"],
  ["get", "/health/deep"],
  ["get", "/update-status"],
  ["get", "/jobs"],
  ["get", "/interviews"],
  ["get", "/metrics"],
  ["post", "/scrape"],
  ["post", "/scrape/text"],
  ["get", "/resumes"],
  ["get", "/offers"],
  ["get", "/reminders/settings"],
  ["get", "/account/sample"],
  ["get", "/seasons"],
  ["post", "/ai/company-brief"],
];

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("requireAuth", () => {
  it.each(SIGNED_IN_ROUTES)("refuses %s %s on a session signed out since, before doing anything", async (method, path) => {
    vi.mocked(checkSession).mockResolvedValueOnce({ ok: false, status: 401, data: { error: "this session was signed out; sign in again" } } as never);

    const res = await request()[method](path)
      .set("Cookie", [`token=${token}`])
      .send({ url: "https://example.com/job", text: "A job", company: "Acme" });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "this session was signed out; sign in again" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks core as the token's user", async () => {
    await request().get("/auth/me").set("Cookie", [`token=${token}`]);

    expect(checkSession).toHaveBeenLastCalledWith("1");
  });

  // Guarded at the app (for its larger body) and by the jobs router; one check is enough, and it still reaches core signed in.
  it("asks core once for an import, and sends the import as the token's user", async () => {
    vi.mocked(checkSession).mockClear();
    vi.mocked(fetch).mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ imported: 0 }) } as Response);

    await request().post("/jobs/import").set("Cookie", [`token=${token}`]).send({ jobs: [] });

    expect(checkSession).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(init?.headers).toMatchObject({ "X-User-Id": "1" });
  });
});
