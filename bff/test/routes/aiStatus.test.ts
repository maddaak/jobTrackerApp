import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("GET /ai-status", () => {
  it("returns aiConfigured true when the scraper reports configured", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ configured: true }),
    });

    const res = await request(app).get("/ai-status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ aiConfigured: true });
  });

  it("returns aiConfigured false when the scraper reports not configured", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ configured: false }),
    });

    const res = await request(app).get("/ai-status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ aiConfigured: false });
  });

  it("returns aiConfigured false when the scraper fetch rejects", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));

    const res = await request(app).get("/ai-status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ aiConfigured: false });
  });
});
