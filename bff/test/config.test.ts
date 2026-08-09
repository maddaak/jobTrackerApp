import { describe, it, expect, afterEach, vi } from "vitest";

// HS512 needs >=64 bytes on both sides; anything shorter must fail at boot, not at first login.
const VALID_JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";

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

  it("throws when JWT_SECRET is too short to sign HS512", async () => {
    vi.resetModules();
    // 32-63 bytes is the dangerous range: long enough for Keys.hmacShaKeyFor, too short for HS512.
    vi.stubEnv("JWT_SECRET", "a".repeat(63));
    vi.stubEnv("INTERNAL_TOKEN", "test-internal-token");

    await expect(import("../src/config.js")).rejects.toThrow(/JWT_SECRET must be at least 64 bytes, got 63/);
  });

  it("throws when INTERNAL_TOKEN is empty", async () => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", VALID_JWT_SECRET);
    vi.stubEnv("INTERNAL_TOKEN", "");

    await expect(import("../src/config.js")).rejects.toThrow(/INTERNAL_TOKEN is required/);
  });

  it("loads normally when both secrets are set", async () => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", VALID_JWT_SECRET);
    vi.stubEnv("INTERNAL_TOKEN", "some-token");

    const config = await import("../src/config.js");
    expect(config.JWT_SECRET).toBe(VALID_JWT_SECRET);
    expect(config.INTERNAL_TOKEN).toBe("some-token");
  });
});
