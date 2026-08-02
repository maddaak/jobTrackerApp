import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { app } from "../src/app.js";

beforeEach(() => {
  // Upstream fetch throws so /auth/register hits a transport failure; the generic body must
  // never leak the underlying error detail.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom secret stack detail")));
  // Silence the server side error log for this test.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("error handling middleware", () => {
  it("returns a generic upstream-failure status and never leaks the stack trace", async () => {
    const res = await request(app)
      .post("/auth/register")
      .send({ username: "alice", password: "Str0ng!Pass" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "internal error" });

    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toContain("boom secret stack detail");
    expect(bodyText).not.toContain("at ");
  });
});
