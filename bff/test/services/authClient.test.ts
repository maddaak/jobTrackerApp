import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerUser, loginUser } from "../../src/services/authClient.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("registerUser", () => {
  it("posts to core's /auth/register with the internal token header", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ token: "t", username: "alice" }),
    });

    const account = { name: "Pat Lee", email: "pat@example.com", username: "alice", password: "Str0ng!Pass" };
    const result = await registerUser(account);

    expect(fetch).toHaveBeenCalledWith(
      "http://core:8080/auth/register",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Internal-Token": "test-internal-token" }),
        body: JSON.stringify(account),
      }),
    );
    expect(result).toEqual({ ok: true, status: 200, data: { token: "t", username: "alice" } });
  });
});

describe("loginUser", () => {
  it("posts to core's /auth/login and surfaces a non-ok result without throwing", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "invalid username or password" }),
    });

    const result = await loginUser("alice", "wrong", "203.0.113.5");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.data).toEqual({ error: "invalid username or password" });
    // Core counts failed sign-ins per address it knows, so the visitor's address goes with them.
    expect(fetch).toHaveBeenCalledWith(
      "http://core:8080/auth/login",
      expect.objectContaining({ headers: expect.objectContaining({ "X-Client-Address": "203.0.113.5" }) }),
    );
  });
});
