function requireSecret(name: string, minBytes = 0): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required and must not be empty`);
  }
  const length = Buffer.byteLength(value, "utf8");
  if (length < minBytes) {
    throw new Error(`${name} must be at least ${minBytes} bytes, got ${length}`);
  }
  return value;
}

function positiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number, got "${raw}"`);
  }
  return value;
}

export const CORE_URL = process.env.CORE_URL ?? "http://core:8080";
export const SCRAPER_URL = process.env.SCRAPER_URL ?? "http://scraper:8081";
export const INTERNAL_TOKEN = requireSecret("INTERNAL_TOKEN");
// Both sides sign and verify HS512, which needs >=64 bytes. Fail at boot rather than on first login.
export const JWT_SECRET = requireSecret("JWT_SECRET", 64);
export const JWT_EXPIRY_DAYS = positiveIntEnv("JWT_EXPIRY_DAYS", 7);
export const COOKIE_MAX_AGE_MS = JWT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
// Set COOKIE_SECURE=false for local http dev; browsers drop secure cookies over plain http.
export const COOKIE_SECURE = (process.env.COOKIE_SECURE ?? "true").toLowerCase() !== "false";
export const PORT = process.env.PORT ?? 3000;

// Per-upstream ceilings so a hung upstream can't hold a BFF request open forever.
export const CORE_TIMEOUT_MS = 10_000;
export const SCRAPER_TIMEOUT_MS = 30_000;
export const SCRAPER_AI_TIMEOUT_MS = 120_000;

// Baked in at image build time; "dev" for a local build, which the update check treats as unknown.
export const APP_VERSION = process.env.APP_VERSION ?? "dev";
// The one outbound call this service makes on its own behalf. Set UPDATE_CHECK=false to stop it.
export const UPDATE_CHECK = (process.env.UPDATE_CHECK ?? "true").toLowerCase() !== "false";
export const UPDATE_REPO = process.env.UPDATE_REPO ?? "maddaak/jobTrackerApp";
export const UPDATE_TIMEOUT_MS = 5_000;
// A release is a rare event and GitHub rate-limits unauthenticated callers, so ask at most daily.
export const UPDATE_CACHE_MS = 24 * 60 * 60 * 1000;
