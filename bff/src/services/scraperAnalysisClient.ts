import { SCRAPER_URL, INTERNAL_TOKEN } from "../config.js";

export type AiCallResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_configured" }
  | { status: "unavailable" };

// Shared by both AI endpoints: the scraper returns 503 when no Anthropic key is configured
// (nothing to retry) and 502 for any other failure (transient — worth retrying). Collapsing
// both into one result shape here means the controller never has to think about HTTP statuses.
async function callScraperAi<T>(path: string, body: unknown): Promise<AiCallResult<T>> {
  const res = await fetch(`${SCRAPER_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": INTERNAL_TOKEN },
    body: JSON.stringify(body),
  });
  if (res.status === 503) {
    return { status: "not_configured" };
  }
  if (!res.ok) {
    return { status: "unavailable" };
  }
  const data = (await res.json()) as T;
  return { status: "ok", data };
}

export interface ResumeAnalysisData {
  summary: string;
  skills: string[];
  seniority: string;
  roles: string[];
}

export function analyzeResume(text: string) {
  return callScraperAi<ResumeAnalysisData>("/analyze-resume", { text });
}

export interface MatchResumeInput {
  id: string;
  fileName: string;
  summary: string;
  skills: string[];
  seniority: string;
  roles: string[];
}

export interface MatchResultData {
  bestResumeId: string;
  recommendation: "APPLY" | "DO_NOT_APPLY";
  reasoning: string;
}

export function matchResume(jobDescriptionText: string, resumes: MatchResumeInput[]) {
  return callScraperAi<MatchResultData>("/match-resume", { jobDescriptionText, resumes });
}
