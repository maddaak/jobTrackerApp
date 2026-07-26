import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";

const JWT_SECRET = "test-secret-not-for-production";

function authCookie(userId = "1", username = "alice") {
  const token = jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: "7d" });
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
    const res = await request(app).post("/scrape").send({ url: "https://example.com/job" });
    expect(res.status).toBe(401);
  });

  it("rejects a non-http(s) url without calling the scraper", async () => {
    const res = await request(app)
      .post("/scrape")
      .set("Cookie", authCookie())
      .send({ url: "file:///etc/passwd" });

    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a missing url", async () => {
    const res = await request(app).post("/scrape").set("Cookie", authCookie()).send({});
    expect(res.status).toBe(400);
  });

  it("forwards the url to the scraper and returns the extracted fields", async () => {
    const scraped = { company: "Acme", role: "Engineer", location: "REMOTE", compMin: 100000, compMax: 130000, raw: "..." };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeScraperResponse(200, scraped));

    const res = await request(app)
      .post("/scrape")
      .set("Cookie", authCookie())
      .send({ url: "https://example.com/job" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(scraped);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/scrape"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Internal-Token": expect.any(String) }),
        body: JSON.stringify({ url: "https://example.com/job" }),
      }),
    );
  });

  it("proxies the scraper's error status through unchanged", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeScraperResponse(400, { error: "bad request" }));

    const res = await request(app)
      .post("/scrape")
      .set("Cookie", authCookie())
      .send({ url: "https://example.com/job" });

    expect(res.status).toBe(400);
  });
});
