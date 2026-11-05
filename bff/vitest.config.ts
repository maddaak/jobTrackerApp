import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["test/setup.ts"],
    env: {
      JWT_SECRET: "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes",
      INTERNAL_TOKEN: "test-internal-token",
      SCRAPER_TOKEN: "test-scraper-token",
      JWT_EXPIRY_DAYS: "7",
      // Off, so each AI test's mocks answer the AI call itself; aiDailyLimit.test.ts turns it on.
      AI_DAILY_LIMIT: "0",
    },
  },
});
