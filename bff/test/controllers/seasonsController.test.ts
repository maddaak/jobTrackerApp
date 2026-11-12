import { describe, it, expect, vi, beforeEach } from "vitest";
import { request } from "../testServer.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";

function authCookie(userId = "1", username = "alice") {
  const token = jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" });
  return `token=${token}`;
}

function fakeCoreResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => (body === undefined ? Promise.reject(new Error("empty")) : Promise.resolve(body)) };
}

const season = { id: 3, name: "Spring hunt", createdAt: "2026-10-01T00:00:00Z", jobCount: 0, active: true };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("/seasons", () => {
  it("needs a login", async () => {
    expect((await request().get("/seasons")).status).toBe(401);
    expect((await request().put("/seasons/active").send({ seasonId: 1 })).status).toBe(401);
  });

  it("creates a season for the caller and passes core's answer back", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(fakeCoreResponse(201, season));

    const res = await request().post("/seasons").set("Cookie", authCookie("42")).send({ name: "Spring hunt" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual(season);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toMatch(/\/seasons$/);
    expect(init).toMatchObject({ method: "POST", headers: expect.objectContaining({ "X-User-Id": "42" }) });
    expect(JSON.parse(init.body)).toEqual({ name: "Spring hunt" });
  });

  // An omitted season means "show every season", which core reads as null.
  it("sends null to show every season", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(fakeCoreResponse(204, undefined));

    const res = await request().put("/seasons/active").set("Cookie", authCookie()).send({});

    expect(res.status).toBe(204);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ seasonId: null });
  });

  it("moves a job into a season", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(fakeCoreResponse(204, undefined));

    const res = await request().put("/seasons/3/jobs/9").set("Cookie", authCookie());

    expect(res.status).toBe(204);
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/seasons\/3\/jobs\/9$/);
    expect(mockFetch.mock.calls[0][1].method).toBe("PUT");
  });

  // Core's refusal names what to do, which the person needs.
  it("passes core's reason through when a season can't be deleted", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(409, { error: "move or delete this season's jobs first" }));

    const res = await request().delete("/seasons/3").set("Cookie", authCookie());

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("move or delete");
  });

  it("refuses an id that isn't a number before calling core", async () => {
    const res = await request().delete("/seasons/abc").set("Cookie", authCookie());

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("closes a season with the offer taken, sending null when there isn't one", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValue(fakeCoreResponse(200, { ...season, closedAt: "2026-11-11T00:00:00Z" }));

    const res = await request().post("/seasons/3/close").set("Cookie", authCookie()).send({ acceptedJobId: 9 });
    await request().post("/seasons/3/close").set("Cookie", authCookie()).send({});

    expect(res.status).toBe(200);
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/seasons\/3\/close$/);
    expect(JSON.parse(mockFetch.mock.calls[0][1].body)).toEqual({ acceptedJobId: 9 });
    expect(JSON.parse(mockFetch.mock.calls[1][1].body)).toEqual({ acceptedJobId: null });
  });

  it("reopens a season, and passes on core refusing a change to a closed one", async () => {
    const mockFetch = fetch as ReturnType<typeof vi.fn>;
    mockFetch.mockResolvedValueOnce(fakeCoreResponse(200, { ...season, closedAt: null }));
    mockFetch.mockResolvedValueOnce(
      fakeCoreResponse(409, { error: "this season is closed; press Edit on it to make changes" }));

    const reopened = await request().post("/seasons/3/reopen").set("Cookie", authCookie());
    const refused = await request().put("/seasons/3/jobs/9").set("Cookie", authCookie());

    expect(reopened.status).toBe(200);
    expect(mockFetch.mock.calls[0][0]).toMatch(/\/seasons\/3\/reopen$/);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toContain("closed");
  });
});
