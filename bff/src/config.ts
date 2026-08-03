function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required and must not be empty`);
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
export const JWT_SECRET = requireSecret("JWT_SECRET");
export const JWT_EXPIRY_DAYS = positiveIntEnv("JWT_EXPIRY_DAYS", 7);
export const COOKIE_MAX_AGE_MS = JWT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
// Set COOKIE_SECURE=false for local http dev; browsers drop secure cookies over plain http.
export const COOKIE_SECURE = (process.env.COOKIE_SECURE ?? "true").toLowerCase() !== "false";
export const PORT = process.env.PORT ?? 3000;

// Per-upstream ceilings so a hung upstream can't hold a BFF request open forever.
export const CORE_TIMEOUT_MS = 10_000;
export const SCRAPER_TIMEOUT_MS = 30_000;
export const SCRAPER_AI_TIMEOUT_MS = 120_000;
