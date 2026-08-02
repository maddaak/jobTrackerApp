import { SCRAPER_URL, INTERNAL_TOKEN, SCRAPER_TIMEOUT_MS } from "../config.js";

export interface ScrapeResultData {
  company: string;
  role: string;
  location: string;
  compMin: number | null;
  compMax: number | null;
  raw: string;
}

export interface ScrapeCallResult {
  ok: boolean;
  status: number;
  // Optional: an empty or non-JSON upstream body leaves nothing to parse (see below).
  data?: ScrapeResultData & { error?: string };
}

export async function scrape(url: string): Promise<ScrapeCallResult> {
  // A network error or the AbortSignal.timeout firing rejects the fetch. Turn that into a
  // non-ok result (504 on timeout, 502 otherwise), matching callCore, so a scraper outage
  // degrades to a real 5xx status instead of the rejection surfacing as a generic 500.
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
  // An upstream HTML error page or empty body makes res.json() throw and lose the real
  // status. Leave data undefined so the caller can forward the true status.
  const data = await res.json().catch(() => undefined);
  return { ok: res.ok, status: res.status, data };
}
