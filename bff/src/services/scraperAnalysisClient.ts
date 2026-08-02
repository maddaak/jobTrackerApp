import { SCRAPER_URL, INTERNAL_TOKEN, SCRAPER_AI_TIMEOUT_MS } from "../config.js";

export type AiCallResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_configured" }
  | { status: "unavailable" };

// One initial attempt plus this many retries. A short linear backoff between them
// keeps us from hammering an upstream that is briefly down.
const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 300;

// The scraper returns 503 when no Anthropic key is configured (fixed, don't retry) and 502/504
// for transient gateway failures (retry, as with network errors and our own timeout). Collapse
// it all into one result shape so controllers never deal with HTTP statuses.
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
        // A 200 with a non-JSON body is unusable: treat as unavailable rather than returning
        // "ok" with undefined data a caller would dereference and crash on.
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
      // A timeout already burned the full budget; retrying stacks another (3 x 120s pins a worker
      // ~6 min). Only a fast network failure is worth falling through to the retry.
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

// Sends full resume text, not a condensed summary: summaries compress away the detail that
// differentiates similar resumes and gave inconsistent picks on repeat calls (full text: 5/5 same).
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
