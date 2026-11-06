import { SCRAPER_URL, SCRAPER_TIMEOUT_MS } from "../config.js";
import { callUpstream, type UpstreamResult } from "./upstream.js";

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
  // The place the posting names, beside location's work model; blank when it names none.
  city: string;
  compMin: number | null;
  compMax: number | null;
  raw: string;
  // The page loaded, whether or not any job data came out of it.
  fetched: boolean;
  reason?: ScrapeFailureReason;
}

export interface TextFieldsData {
  role: string;
  location: ScrapeResultData["location"];
  compMin: number | null;
  compMax: number | null;
}

// Reads a pasted description with no AI, so it works and costs nothing whether or not one is set up.
export function readText(text: string): Promise<UpstreamResult<TextFieldsData>> {
  return callUpstream<TextFieldsData>(`${SCRAPER_URL}/scrape-text`, {
    method: "POST",
    json: { text },
    timeoutMs: SCRAPER_TIMEOUT_MS,
  });
}

export function scrape(url: string): Promise<UpstreamResult<ScrapeResultData>> {
  return callUpstream<ScrapeResultData>(`${SCRAPER_URL}/scrape`, {
    method: "POST",
    json: { url },
    timeoutMs: SCRAPER_TIMEOUT_MS,
  });
}
