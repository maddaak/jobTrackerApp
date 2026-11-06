import { callCore } from "./coreClient.js";

// A saved AI answer. Its content is whatever the scraper returned plus what the bff added, such as the
// notes a debrief was made from; core stores it without reading it.
export interface AiResultData {
  content: Record<string, unknown>;
  createdAt: string;
}

export const JOB_AI_KINDS = ["prep", "follow-up", "negotiation", "tailoring"] as const;
export type JobAiKind = (typeof JOB_AI_KINDS)[number];
export const ROUND_AI_KINDS = ["debrief"] as const;
export type RoundAiKind = (typeof ROUND_AI_KINDS)[number];
export type AccountAiKind = "company-brief" | "insights" | "offer-comparison";

// season names the one a per-season answer was made from; without it core uses the season shown now.
function accountPath(kind: AccountAiKind, company?: string, season?: string) {
  const query = [
    company === undefined ? null : `company=${encodeURIComponent(company)}`,
    season === undefined ? null : `season=${encodeURIComponent(season)}`,
  ].filter(part => part !== null).join("&");
  return query ? `/ai/${kind}?${query}` : `/ai/${kind}`;
}

// Prep is kept per kind of round, so it names one; the other kinds have one answer per job.
function jobPath(jobId: string, kind: JobAiKind, interviewType?: string) {
  const path = `/jobs/${encodeURIComponent(jobId)}/ai/${kind}`;
  return interviewType === undefined ? path : `${path}?interviewType=${encodeURIComponent(interviewType)}`;
}

export function saveJobAi(
  userId: string, jobId: string, kind: JobAiKind, content: Record<string, unknown>, interviewType?: string,
) {
  return callCore<AiResultData>(jobPath(jobId, kind, interviewType), { method: "PUT", userId, body: { content } });
}

export function clearJobAi(userId: string, jobId: string, kind: JobAiKind, interviewType?: string) {
  return callCore<void>(jobPath(jobId, kind, interviewType), { method: "DELETE", userId });
}

export function saveRoundAi(userId: string, roundId: string, kind: RoundAiKind, content: Record<string, unknown>) {
  return callCore<AiResultData>(`/interviews/${encodeURIComponent(roundId)}/ai/${kind}`, {
    method: "PUT", userId, body: { content },
  });
}

export function clearRoundAi(userId: string, roundId: string, kind: RoundAiKind) {
  return callCore<void>(`/interviews/${encodeURIComponent(roundId)}/ai/${kind}`, { method: "DELETE", userId });
}

export function getAccountAi(userId: string, kind: AccountAiKind, company?: string) {
  return callCore<AiResultData>(accountPath(kind, company), { userId });
}

export function saveAccountAi(
  userId: string, kind: AccountAiKind, content: Record<string, unknown>, where: { company?: string; season?: string } = {},
) {
  return callCore<AiResultData>(accountPath(kind, where.company, where.season), { method: "PUT", userId, body: { content } });
}

export function clearAccountAi(userId: string, kind: AccountAiKind, company?: string) {
  return callCore<void>(accountPath(kind, company), { method: "DELETE", userId });
}
