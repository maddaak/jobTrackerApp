import { CORE_URL, SCRAPER_URL, CORE_TIMEOUT_MS } from "../config.js";
import { callUpstream } from "./upstream.js";

// Never echoes the internal url to a client, whatever went wrong.
async function checkHealth(baseUrl: string): Promise<unknown> {
  const result = await callUpstream<unknown>(`${baseUrl}/health`, { timeoutMs: CORE_TIMEOUT_MS });
  return result.data ?? { status: "unreachable" };
}

export function checkCoreHealth() {
  return checkHealth(CORE_URL);
}

export function checkScraperHealth() {
  return checkHealth(SCRAPER_URL);
}
