import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { request } from "./testServer.js";

beforeEach(() => {
  // Force a transport failure so the generic body must hide the error detail.
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("boom secret stack detail")));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("error handling middleware", () => {
  it("returns a generic upstream-failure status and never leaks the stack trace", async () => {
    const res = await request()
      .post("/auth/register")
      .send({ name: "Pat Lee", email: "pat@example.com", username: "alice", password: "Str0ng!Pass" });

    expect(res.status).toBe(502);
    expect(res.body).toEqual({ error: "internal error" });

    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toContain("boom secret stack detail");
    expect(bodyText).not.toContain("at ");
  });

  it("answers an unknown route with a JSON 404, not Express's HTML page", async () => {
    const res = await request().get("/no-such-route");

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "not found" });
  });
});
