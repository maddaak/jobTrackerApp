import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";
import { resetUpdateCache } from "../../src/services/updateClient.js";

const token = jwt.sign({ sub: "1", username: "alice" }, process.env.JWT_SECRET as string, {
  algorithm: "HS512",
});

beforeEach(() => {
  resetUpdateCache();
  vi.stubGlobal("fetch", vi.fn());
});

describe("GET /update-status", () => {
  it("requires auth, so the running version is not public", async () => {
    const res = await request(app).get("/update-status");

    expect(res.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns the running version and the newest release to a logged-in user", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve([{ name: "v2.2.1" }, { name: "v3" }]),
    });

    const res = await request(app).get("/update-status").set("Cookie", [`token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.latest).toBe("v3");
    expect(res.body).toHaveProperty("current");
    expect(res.body).toHaveProperty("updateAvailable");
  });

  it("still answers 200 when GitHub cannot be reached", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error("network down"));

    const res = await request(app).get("/update-status").set("Cookie", [`token=${token}`]);

    expect(res.status).toBe(200);
    expect(res.body.updateAvailable).toBe(false);
  });
});
