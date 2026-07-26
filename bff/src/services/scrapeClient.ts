import { SCRAPER_URL, INTERNAL_TOKEN } from "../config.js";

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
  data: ScrapeResultData & { error?: string };
}

export async function scrape(url: string): Promise<ScrapeCallResult> {
  const res = await fetch(`${SCRAPER_URL}/scrape`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": INTERNAL_TOKEN },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}
