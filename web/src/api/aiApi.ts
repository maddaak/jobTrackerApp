import type { InterviewType } from "./interviewsApi";
import { request } from "./request";

// A saved AI answer. The content's shape depends on which feature made it; the types below name each one.
export interface AiResult<T = Record<string, unknown>> {
  content: T;
  createdAt: string;
}

export type AssistOutcome<T> =
  | { status: "ok"; result: AiResult<T> }
  | { status: "not_configured" }
  | { status: "unavailable" };

export interface Source {
  title: string;
  url: string;
}

// False when the AI provider can't search the web: the answer is the model's own knowledge, with no sources.
export interface Researched {
  searched: boolean;
  sources: Source[];
}

export interface CompanyBrief extends Researched {
  company: string;
  overview: string;
  facts: string[];
  recentNews: string[];
  interviewProcess: string;
  watchOuts: string[];
}

export interface PracticeItem {
  title: string;
  url: string;
  why: string;
}

export interface InterviewPrep extends Researched {
  interviewType: InterviewType;
  focus: string;
  // Pages to open: problems for a coding round, primers for design, question banks for other fields.
  practice: PracticeItem[];
  topics: string[];
  likelyQuestions: string[];
  storiesToTell: string[];
  questionsToAsk: string[];
  // The resume the stories came from, or null when there was none to read.
  resumeFileName: string | null;
  // What the recruiter said about the round, kept so it can be corrected and run again.
  recruiterNotes: string;
}

export interface Debrief {
  summary: string;
  thankYouNote: string;
  followUps: string[];
  // What the debrief was made from, kept so it can be corrected and run again.
  notes: string;
}

export interface EmailDraft {
  subject: string;
  body: string;
  asks: string[];
}

export interface Tailoring {
  summary: string;
  keywordsToAdd: string[];
  bulletChanges: { current: string; suggested: string; why: string }[];
  resumeId: string;
  resumeFileName: string;
}

export interface Insights {
  summary: string;
  patterns: { title: string; detail: string }[];
  nextSteps: string[];
  // How many jobs there were when it ran, so the page can say when it has fallen behind.
  jobCount: number;
}

// Prep is kept per kind of round, under "prep:<type>".
export type PrepKey = `prep:${InterviewType}`;

export type JobAiResults = {
  "follow-up"?: AiResult<EmailDraft>;
  negotiation?: AiResult<EmailDraft>;
  tailoring?: AiResult<Tailoring>;
} & { [key in PrepKey]?: AiResult<InterviewPrep> };

export interface RoundAiResults {
  debrief?: AiResult<Debrief>;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function getCompanyBrief(company: string): Promise<AiResult<CompanyBrief> | null> {
  const saved = await request<{ result: AiResult<CompanyBrief> | null }>(
    `/ai/company-brief?company=${encodeURIComponent(company)}`, "failed to load the company brief");
  return saved.result;
}

export async function runCompanyBrief(company: string, role: string): Promise<AssistOutcome<CompanyBrief>> {
  return request("/ai/company-brief", "failed to brief you on the company", json({ company, role }));
}

export async function clearCompanyBrief(company: string): Promise<void> {
  await request(`/ai/company-brief?company=${encodeURIComponent(company)}`, "failed to remove the brief", { method: "DELETE" });
}

export async function getInsights(): Promise<AiResult<Insights> | null> {
  const saved = await request<{ result: AiResult<Insights> | null }>("/ai/insights", "failed to load the patterns");
  return saved.result;
}

export async function runInsights(): Promise<AssistOutcome<Insights>> {
  return request("/ai/insights", "failed to find patterns", { method: "POST" });
}

export async function clearInsights(): Promise<void> {
  await request("/ai/insights", "failed to remove the patterns", { method: "DELETE" });
}

export async function runFollowUp(jobId: number): Promise<AssistOutcome<EmailDraft>> {
  return request(`/ai/jobs/${jobId}/follow-up`, "failed to draft the follow-up", { method: "POST" });
}

export async function runNegotiation(jobId: number): Promise<AssistOutcome<EmailDraft>> {
  return request(`/ai/jobs/${jobId}/negotiation`, "failed to draft the counter-offer", { method: "POST" });
}

export async function runTailoring(jobId: number, resumeId?: string): Promise<AssistOutcome<Tailoring>> {
  return request(`/ai/jobs/${jobId}/tailoring`, "failed to tailor the resume", json({ resumeId }));
}

export async function clearJobResult(jobId: number, kind: "follow-up" | "negotiation" | "tailoring"): Promise<void> {
  await request(`/ai/jobs/${jobId}/${kind}`, "failed to remove it", { method: "DELETE" });
}

export async function runPrep(
  jobId: number, interviewType: InterviewType, recruiterNotes: string,
): Promise<AssistOutcome<InterviewPrep>> {
  return request(`/ai/jobs/${jobId}/prep`, "failed to prepare for the interview", json({ interviewType, recruiterNotes }));
}

export async function clearPrep(jobId: number, interviewType: InterviewType): Promise<void> {
  await request(`/ai/jobs/${jobId}/prep?interviewType=${interviewType}`, "failed to remove it", { method: "DELETE" });
}

export async function runDebrief(roundId: string, notes: string): Promise<AssistOutcome<Debrief>> {
  return request(`/ai/rounds/${roundId}/debrief`, "failed to write the debrief", json({ notes }));
}

export async function clearRoundResult(roundId: string, kind: keyof RoundAiResults): Promise<void> {
  await request(`/ai/rounds/${roundId}/${kind}`, "failed to remove it", { method: "DELETE" });
}
