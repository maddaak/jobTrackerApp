// .env.example's placeholders all start with this. They are public on GitHub, so one left in place
// is a signing key anyone can read, however long it is.
const PLACEHOLDER_PREFIX = "change_me";

function requireSecret(name: string, minBytes = 0): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required and must not be empty`);
  }
  if (value.startsWith(PLACEHOLDER_PREFIX)) {
    throw new Error(`${name} is still the .env.example placeholder; set a real value (openssl rand -hex 32)`);
  }
  const length = Buffer.byteLength(value, "utf8");
  if (length < minBytes) {
    throw new Error(`${name} must be at least ${minBytes} bytes, got ${length}`);
  }
  return value;
}

function intEnv(name: string, fallback: number, min = 1): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be a whole number of ${min} or more, got "${raw}"`);
  }
  return value;
}

export const CORE_URL = process.env.CORE_URL ?? "http://core:8080";
export const SCRAPER_URL = process.env.SCRAPER_URL ?? "http://scraper:8081";
export const INTERNAL_TOKEN = requireSecret("INTERNAL_TOKEN");
// Its own secret, so a scraper that's broken into can't call core as anyone. A .env from before it
// falls back to the shared one until setup.sh adds it.
export const SCRAPER_TOKEN = process.env.SCRAPER_TOKEN ? requireSecret("SCRAPER_TOKEN") : INTERNAL_TOKEN;
if (SCRAPER_TOKEN === INTERNAL_TOKEN) {
  console.warn("SCRAPER_TOKEN is not set, so the scraper shares core's token; run sh setup.sh to add one");
}
// Both sides sign and verify HS512, which needs >=64 bytes. Fail at boot rather than on first login.
export const JWT_SECRET = requireSecret("JWT_SECRET", 64);
export const JWT_EXPIRY_DAYS = intEnv("JWT_EXPIRY_DAYS", 7);

// Proxies in front of this app's own nginx, such as Cloudflare Tunnel, Caddy, or Traefik. Without the
// count, every visitor looks like the proxy, so one guesser could use up the owner's login attempts.
export const TRUSTED_PROXIES = intEnv("TRUSTED_PROXIES", 0, 0);
// Only against floods and scripts: opening every card on a busy board is a few dozen requests.
export const REQUESTS_PER_MINUTE = intEnv("REQUESTS_PER_MINUTE", 600);
// AI calls bill the owner's account; this caps a day's spend if a session is stolen or something loops.
// 0 turns the cap off.
export const AI_DAILY_LIMIT = intEnv("AI_DAILY_LIMIT", 100, 0);
export const COOKIE_MAX_AGE_MS = JWT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
export const PORT = process.env.PORT ?? 3000;

// Per-upstream ceilings so a hung upstream can't hold a BFF request open forever.
export const CORE_TIMEOUT_MS = 10_000;
// A backup carries every image and resume, so writing or restoring one takes longer than a page load.
export const BACKUP_TIMEOUT_MS = 120_000;
// Far above any other upload: a backup holds many 10MB images. Kept in step with nginx's restore location.
export const MAX_BACKUP_BYTES = 200 * 1024 * 1024;
export const SCRAPER_TIMEOUT_MS = 30_000;
// Raising this or BACKUP_TIMEOUT_MS means raising nginx's proxy_read_timeout above it too.
export const SCRAPER_AI_TIMEOUT_MS = 120_000;

// Baked in at image build time; "dev" for a local build, which the update check treats as unknown.
export const APP_VERSION = process.env.APP_VERSION ?? "dev";
// The one outbound call this service makes on its own behalf. Set UPDATE_CHECK=false to stop it.
export const UPDATE_CHECK = (process.env.UPDATE_CHECK ?? "true").toLowerCase() !== "false";
export const UPDATE_REPO = process.env.UPDATE_REPO ?? "maddaak/jobTrackerApp";
export const UPDATE_TIMEOUT_MS = 5_000;
// A release is a rare event and GitHub rate-limits unauthenticated callers, so ask at most daily.
export const UPDATE_CACHE_MS = 24 * 60 * 60 * 1000;
