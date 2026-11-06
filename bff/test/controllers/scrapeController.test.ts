import { describe, it, expect, vi, beforeEach } from "vitest";
import { request } from "../testServer.js";
import jwt from "jsonwebtoken";

const JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";

function authCookie(userId = "1", username = "alice") {
  const token = jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" });
  return `token=${token}`;
}

function fakeScraperResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("POST /scrape", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request().post("/scrape").send({ url: "https://example.com/job" });
    expect(res.status).toBe(401);
  });

  it("rejects a non-http(s) url without calling the scraper", async () => {
    const res = await request()
      .post("/scrape")
      .set("Cookie", authCookie())
      .send({ url: "file:///etc/passwd" });

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a missing url", async () => {
    const res = await request().post("/scrape").set("Cookie", authCookie()).send({});
    expect(res.status).toBe(400);
  });

  // Internal hosts are refused by the scraper, which checks the address it dials; see
  // scraper/internal/scrape/fetch_test.go (TestIsSafeScrapeURLRefusesEveryInternalSpelling).
  it("rejects a url that isn't a string without calling the scraper", async () => {
    const res = await request().post("/scrape").set("Cookie", authCookie()).send({ url: 42 });

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("forwards the url to the scraper and returns the extracted fields", async () => {
    const scraped = { company: "Acme", role: "Engineer", location: "REMOTE", compMin: 100000, compMax: 130000, raw: "..." };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeScraperResponse(200, scraped));

    const res = await request()
      .post("/scrape")
      .set("Cookie", authCookie())
      .send({ url: "https://example.com/job" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(scraped);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/scrape"),
      expect.objectContaining({
        method: "POST",
        // The scraper's own token, never core's, so the scraper holds nothing core trusts.
        headers: expect.objectContaining({ "X-Internal-Token": "test-scraper-token" }),
        body: JSON.stringify({ url: "https://example.com/job" }),
      }),
    );
  });

  it("proxies the scraper's error status through unchanged", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeScraperResponse(400, { error: "bad request" }));

    const res = await request()
      .post("/scrape")
      .set("Cookie", authCookie())
      .send({ url: "https://example.com/job" });

    expect(res.status).toBe(400);
  });
});

describe("POST /scrape/text", () => {
  it("returns the fields read from a pasted description", async () => {
    const fields = { role: "Engineer", location: "REMOTE", compMin: 100000, compMax: 130000 };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeScraperResponse(200, fields));

    const res = await request().post("/scrape/text").set("Cookie", authCookie()).send({ text: "Engineer. Remote." });

    expect(res.body).toEqual(fields);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/scrape-text"),
      expect.objectContaining({ body: JSON.stringify({ text: "Engineer. Remote." }) }),
    );
  });

  it("needs text, and not an unbounded amount", async () => {
    for (const text of ["", "  ", 42, "x".repeat(50_001)]) {
      expect((await request().post("/scrape/text").set("Cookie", authCookie()).send({ text })).status).toBe(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
