import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    env: {
      JWT_SECRET: "test-secret-not-for-production",
      INTERNAL_TOKEN: "test-internal-token",
      JWT_EXPIRY_DAYS: "7",
    },
  },
});
