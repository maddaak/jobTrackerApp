import { SCRAPER_URL, SCRAPER_TIMEOUT_MS } from "../config.js";
import { callUpstream } from "./upstream.js";

// Fail closed so a scraper outage hides AI features rather than exposing ones that can't work.
export async function getAiConfigured(): Promise<boolean> {
  const result = await callUpstream<{ configured?: boolean }>(`${SCRAPER_URL}/ai-status`, {
    timeoutMs: SCRAPER_TIMEOUT_MS,
  });
  return result.ok && result.data?.configured === true;
}
