import { AI_DAILY_LIMIT, SCRAPER_URL, SCRAPER_AI_TIMEOUT_MS } from "../config.js";
import { currentUserId } from "../middleware/requireAuth.js";
import { callCore } from "./coreClient.js";
import { callUpstream } from "./upstream.js";

export type AiCallResult<T> =
  | { status: "ok"; data: T }
  | { status: "not_configured" }
  // Refused before any answer: by the scraper (too many offers, an empty description), 400, or by the day's
  // limit, 429, so the page can tell "try tomorrow" from "change the request".
  | { status: "rejected"; error: string; httpStatus: 400 | 429 }
  | { status: "unavailable" };

// Asked before every AI call, since every one passes through here. Core keeps the day's count in the
// database, so a restart doesn't start the day over. The user id lets core refuse a signed-out session
// before anything is billed. Null means go ahead.
async function refusedByDailyLimit(): Promise<AiCallResult<never> | null> {
  if (AI_DAILY_LIMIT === 0) return null;
  const counted = await callCore<{ error?: string }>(`/ai-usage?limit=${AI_DAILY_LIMIT}`, {
    method: "POST",
    userId: currentUserId(),
  });
  if (counted.ok) return null;
  if (counted.status === 429) {
    return { status: "rejected", error: counted.data?.error ?? "the daily AI limit is used up", httpStatus: 429 };
  }
  // Uncounted is unbilled: without core there's no knowing whether the day has room.
  return { status: "unavailable" };
}

// No retries: the scraper already retries what is safe, and retrying here too billed up to nine
// AI calls per click.
async function callScraperAi<T>(path: string, body: unknown): Promise<AiCallResult<T>> {
  const refused = await refusedByDailyLimit();
  if (refused) return refused;
  const result = await callUpstream<T & { error?: string }>(`${SCRAPER_URL}${path}`, {
    method: "POST",
    json: body,
    timeoutMs: SCRAPER_AI_TIMEOUT_MS,
  });
  if (result.status === 503) {
    return { status: "not_configured" };
  }
  if (result.status >= 400 && result.status < 500) {
    return { status: "rejected", error: result.data?.error ?? "the request was refused", httpStatus: 400 };
  }
  // A 200 with a non-JSON body is unusable; treat as unavailable, not "ok" with undefined data.
  if (!result.ok || result.data === undefined) {
    return { status: "unavailable" };
  }
  return { status: "ok", data: result.data };
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
  company: string;
  role: string;
  strengths: string[];
  gaps: string[];
}

// Sends full resume text, not a condensed summary: summaries gave inconsistent picks on repeat calls.
export function matchResume(jobDescriptionText: string, resumes: MatchResumeDocument[]) {
  return callScraperAi<MatchResultData>("/match-resume", { jobDescriptionText, resumes });
}

// The scraper speaks string ids; the controller maps them back to job ids.
export interface CompareOfferInput {
  id: string;
  company: string;
  role: string;
  postedRole: string;
  location: string;
  baseSalary: number | null;
  annualBonus: number | null;
  equityPerYear: number | null;
  equityByYear: number[];
  signOnByYear: number[];
  averagePerYear: number | null;
  averagedOverYears: number;
  compByYear: number[];
  priceGrowthPercent: number | null;
  projectedCompByYear: number[];
  startDate: string;
  decisionDeadline: string;
  notes: string;
}

export interface OfferAssessmentData {
  id: string;
  pros: string[];
  cons: string[];
  negotiationPoints: string[];
}

export interface CompareOffersResultData {
  recommendedOfferId: string;
  summary: string;
  offers: OfferAssessmentData[];
}

export function compareOffers(priorities: string, offers: CompareOfferInput[]) {
  return callScraperAi<CompareOffersResultData>("/compare-offers", { priorities, offers });
}

export interface MarketCheckInput {
  company: string;
  // The title offered; postedRole is the posting's, set only when they differ.
  role: string;
  postedRole: string;
  location: string;
  baseSalary: number | null;
  annualBonus: number | null;
  equityPerYear: number | null;
  // Across every year it's paid in.
  signOnTotal: number | null;
}

export interface MarketCheckData {
  verdict: "below" | "at" | "above" | "unclear";
  typicalLow: number | null;
  typicalHigh: number | null;
  summary: string;
  negotiationPoints: string[];
  // False when the provider can't search: the verdict is the model's estimate, with no sources.
  searched: boolean;
  sources: { title: string; url: string }[];
}

export function checkMarket(offer: MarketCheckInput) {
  return callScraperAi<MarketCheckData>("/market-check", offer);
}

// Served together at /assist/<name>. The scraper checks each answer's shape, so it passes through as is.
export type AssistName =
  | "company-brief" | "interview-prep" | "debrief" | "follow-up" | "negotiation" | "tailor-resume" | "insights";

export function runAssist(name: AssistName, input: Record<string, unknown>) {
  return callScraperAi<Record<string, unknown>>(`/assist/${name}`, input);
}
