import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { request } from "../testServer.js";

const token = jwt.sign({ sub: "1", username: "alice" }, process.env.JWT_SECRET as string, { algorithm: "HS512" });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("GET /health", () => {
  it("returns ok status for the bff service", async () => {
    const res = await request().get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "bff" });
  });
});

describe("GET /health/deep", () => {
  it("reports each service to a current session", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ status: "ok" }) });

    const res = await request().get("/health/deep").set("Cookie", [`token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ bff: "ok", core: { status: "ok" }, scraper: { status: "ok" } });
  });
});
