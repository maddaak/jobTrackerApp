import { SCRAPER_URL, INTERNAL_TOKEN, SCRAPER_TIMEOUT_MS } from "../config.js";

// Fail closed so a scraper outage hides AI features rather than exposing ones that can't work.
export async function getAiConfigured(): Promise<boolean> {
  try {
    const res = await fetch(`${SCRAPER_URL}/ai-status`, {
      headers: { "X-Internal-Token": INTERNAL_TOKEN },
      signal: AbortSignal.timeout(SCRAPER_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.configured === true;
  } catch {
    return false;
  }
}
