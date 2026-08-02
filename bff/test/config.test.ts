import { describe, it, expect, afterEach, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("config secret validation", () => {
  it("throws when JWT_SECRET is empty", async () => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", "");
    vi.stubEnv("INTERNAL_TOKEN", "test-internal-token");

    await expect(import("../src/config.js")).rejects.toThrow(/JWT_SECRET is required/);
  });

  it("throws when INTERNAL_TOKEN is empty", async () => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", "test-secret-not-for-production");
    vi.stubEnv("INTERNAL_TOKEN", "");

    await expect(import("../src/config.js")).rejects.toThrow(/INTERNAL_TOKEN is required/);
  });

  it("loads normally when both secrets are set", async () => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", "some-secret");
    vi.stubEnv("INTERNAL_TOKEN", "some-token");

    const config = await import("../src/config.js");
    expect(config.JWT_SECRET).toBe("some-secret");
    expect(config.INTERNAL_TOKEN).toBe("some-token");
  });
});
