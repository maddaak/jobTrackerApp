import type { Location } from "./jobsApi";
import { request } from "./request";

export type ScrapeFailureReason =
  | "blocked_host"
  | "request_failed"
  | "unreachable"
  | "http_error"
  | "unreadable"
  | "no_job_data";

export interface ScrapeResult {
  company: string;
  role: string;
  location: Location | "";
  compMin: number | null;
  compMax: number | null;
  raw: string;
  // The page loaded, whether or not any job data came out of it.
  fetched: boolean;
  reason?: ScrapeFailureReason;
}

// A blocked or dead link is a different problem from a page that simply had no job description.
export const SCRAPE_FAILURE_MESSAGE: Record<ScrapeFailureReason, string> = {
  blocked_host: "That address can't be fetched. Paste the description below instead.",
  request_failed: "That URL couldn't be used. Check it and try again, or paste the description below.",
  unreachable: "Couldn't reach that page — it may be down or the link may be wrong.",
  http_error: "That page returned an error, so it may have been taken down or need a login.",
  unreadable: "That page couldn't be read as HTML.",
  no_job_data: "That page loaded but didn't contain a readable job description.",
};

export async function scrapeJob(url: string): Promise<ScrapeResult> {
  return request<ScrapeResult>("/scrape", "failed to fetch job details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}
