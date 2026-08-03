import { SCRAPER_URL, INTERNAL_TOKEN, SCRAPER_AI_TIMEOUT_MS } from "../config.js";

export type AiCallResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_configured" }
  | { status: "unavailable" };

// Retries with backoff so a briefly-down upstream isn't hammered.
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 300;

// 503 means no Anthropic key (don't retry); 502/504 are transient (retry). One result shape so controllers skip HTTP status.
async function callScraperAi<T>(path: string, body: unknown): Promise<AiCallResult<T>> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isLastAttempt = attempt === MAX_ATTEMPTS;
    try {
      const res = await fetch(`${SCRAPER_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Internal-Token": INTERNAL_TOKEN },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(SCRAPER_AI_TIMEOUT_MS),
      });

      if (res.status === 503) {
        return { status: "not_configured" };
      }
      if (res.ok) {
        // A 200 with a non-JSON body is unusable; treat as unavailable, not "ok" with undefined data.
        const data = await res.json().catch(() => undefined);
        if (data === undefined) {
          return { status: "unavailable" };
        }
        return { status: "ok", data: data as T };
      }
      if (res.status !== 502 && res.status !== 504) {
        return { status: "unavailable" };
      }
    } catch (err) {
      // A timeout already burned the full budget; retrying would stack another (3 x 120s pins a worker ~6 min).
      if (err instanceof Error && err.name === "TimeoutError") {
        return { status: "unavailable" };
      }
    }

    if (isLastAttempt) {
      return { status: "unavailable" };
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_BACKOFF_MS * attempt));
  }
  return { status: "unavailable" };
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

export interface MatchResumeDocument {
  id: string;
  fileName: string;
  fullText: string;
}

export interface MatchResultData {
  bestResumeId: string;
  recommendation: "APPLY" | "DO_NOT_APPLY" | "INSUFFICIENT_JD";
  reasoning: string;
}

// Sends full resume text, not a condensed summary: summaries gave inconsistent picks on repeat calls.
export function matchResume(jobDescriptionText: string, resumes: MatchResumeDocument[]) {
  return callScraperAi<MatchResultData>("/match-resume", { jobDescriptionText, resumes });
}

export interface RecommendVariantInput {
  id: string;
  displayName: string;
  blurb: string;
}

export interface RecommendVariantResultData {
  variantId: string;
  reason: string;
}

export function recommendResumeVariant(jobDescriptionText: string, variants: RecommendVariantInput[]) {
  return callScraperAi<RecommendVariantResultData>("/recommend-resume-variant", { jobDescriptionText, variants });
}
