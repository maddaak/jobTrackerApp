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

    const result = await registerUser("alice", "Str0ng!Pass");

    expect(fetch).toHaveBeenCalledWith(
      "http://core:8080/auth/register",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-Internal-Token": "test-internal-token" }),
        body: JSON.stringify({ username: "alice", password: "Str0ng!Pass" }),
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

    const result = await loginUser("alice", "wrong");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.data).toEqual({ error: "invalid username or password" });
  });
});
