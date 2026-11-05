import { describe, it, expect, vi, beforeEach } from "vitest";
import { request } from "../testServer.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("sameOrigin", () => {
  it.each(["same-site", "cross-site"])("refuses a change sent from %s, before anything runs", async site => {
    const res = await request().post("/auth/logout").set("Sec-Fetch-Site", site);

    expect(res.status).toBe(403);
    expect(res.headers["set-cookie"]).toBeUndefined();
  });

  it.each([["same-origin"], ["none"], [undefined]])("lets a change through from %s", async site => {
    const req = request().post("/auth/logout");
    const res = await (site ? req.set("Sec-Fetch-Site", site) : req);

    expect(res.status).toBe(200);
  });

  it("lets a read through from another site, since a read changes nothing", async () => {
    const res = await request().get("/health").set("Sec-Fetch-Site", "cross-site");

    expect(res.status).toBe(200);
  });
});
