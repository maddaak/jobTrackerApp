import type { Location } from "./jobsApi";
import { request } from "./request";

export interface ScrapeResult {
  company: string;
  role: string;
  location: Location | "";
  compMin: number | null;
  compMax: number | null;
  raw: string;
}

export async function scrapeJob(url: string): Promise<ScrapeResult> {
  return request<ScrapeResult>("/scrape", "failed to fetch job details", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}
