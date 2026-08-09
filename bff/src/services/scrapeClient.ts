import { SCRAPER_URL, INTERNAL_TOKEN, SCRAPER_TIMEOUT_MS } from "../config.js";

export type ScrapeFailureReason =
  | "blocked_host"
  | "request_failed"
  | "unreachable"
  | "http_error"
  | "unreadable"
  | "no_job_data";

export interface ScrapeResultData {
  company: string;
  role: string;
  location: string;
  compMin: number | null;
  compMax: number | null;
  raw: string;
  // The page loaded, whether or not any job data came out of it.
  fetched: boolean;
  reason?: ScrapeFailureReason;
}

export interface ScrapeCallResult {
  ok: boolean;
  status: number;
  // Undefined on an empty/non-JSON body.
  data?: ScrapeResultData & { error?: string };
}

export async function scrape(url: string): Promise<ScrapeCallResult> {
  // Turn a fetch rejection into a non-ok result (504 timeout, 502 otherwise) so an outage degrades to a real 5xx.
  let res: globalThis.Response;
  try {
    res = await fetch(`${SCRAPER_URL}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Token": INTERNAL_TOKEN },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(SCRAPER_TIMEOUT_MS),
    });
  } catch (err) {
    const status = err instanceof DOMException && err.name === "TimeoutError" ? 504 : 502;
    return { ok: false, status, data: undefined };
  }
  // Empty/non-JSON body: leave data undefined but forward the real status.
  const data = await res.json().catch(() => undefined);
  return { ok: res.ok, status: res.status, data };
}
