import { readFileSync } from "node:fs";
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

  // Read from the real template, so a new placeholder that dodges the prefix fails here.
  it("refuses every secret still set to the shipped .env.example placeholder", async () => {
    const template = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    const placeholder = (key: string) => template.match(new RegExp(`^${key}=(.*)$`, "m"))![1];

    vi.resetModules();
    vi.stubEnv("JWT_SECRET", placeholder("JWT_SECRET"));
    vi.stubEnv("INTERNAL_TOKEN", "some-token");
    await expect(import("../src/config.js")).rejects.toThrow(/JWT_SECRET is still the .env.example placeholder/);

    vi.resetModules();
    vi.stubEnv("JWT_SECRET", VALID_JWT_SECRET);
    vi.stubEnv("INTERNAL_TOKEN", placeholder("INTERNAL_TOKEN"));
    await expect(import("../src/config.js")).rejects.toThrow(/INTERNAL_TOKEN is still the .env.example placeholder/);

    vi.resetModules();
    vi.stubEnv("INTERNAL_TOKEN", "some-token");
    vi.stubEnv("SCRAPER_TOKEN", placeholder("SCRAPER_TOKEN"));
    await expect(import("../src/config.js")).rejects.toThrow(/SCRAPER_TOKEN is still the .env.example placeholder/);
  });

  // A .env from before SCRAPER_TOKEN existed must still start.
  it("falls back to the shared token when SCRAPER_TOKEN isn't set", async () => {
    vi.resetModules();
    vi.stubEnv("JWT_SECRET", VALID_JWT_SECRET);
    vi.stubEnv("INTERNAL_TOKEN", "some-token");
    vi.stubEnv("SCRAPER_TOKEN", "");

    expect((await import("../src/config.js")).SCRAPER_TOKEN).toBe("some-token");
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
