export const CORE_URL = process.env.CORE_URL ?? "http://core:8080";
export const SCRAPER_URL = process.env.SCRAPER_URL ?? "http://scraper:8081";
export const INTERNAL_TOKEN = process.env.INTERNAL_TOKEN ?? "";
export const JWT_SECRET = process.env.JWT_SECRET ?? "";
export const JWT_EXPIRY_DAYS = Number(process.env.JWT_EXPIRY_DAYS ?? "7");
export const COOKIE_MAX_AGE_MS = JWT_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
export const PORT = process.env.PORT ?? 3000;
