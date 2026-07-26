import type { Location } from "./jobsApi";

export interface ScrapeResult {
  company: string;
  role: string;
  location: Location | "";
  compMin: number | null;
  compMax: number | null;
  raw: string;
}

export async function scrapeJob(url: string): Promise<ScrapeResult> {
  const res = await fetch("/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "failed to fetch job details");
  }
  return data;
}
