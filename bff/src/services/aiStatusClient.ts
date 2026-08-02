import { SCRAPER_URL, INTERNAL_TOKEN, SCRAPER_TIMEOUT_MS } from "../config.js";

// Asks the scraper (the only service holding the Anthropic key) whether AI is configured.
// Fails closed: any network error, timeout, non-ok status, or non-JSON body returns false so the
// frontend hides AI features rather than showing something that cannot work. The timeout stops a
// stalled scraper from holding this request (and its BFF socket) open indefinitely.
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
