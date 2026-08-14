import type { InterviewType, Interviewer } from "./interviewsApi";
import { request } from "./request";

export type SourceCategory =
  | "SELF_APPLIED"
  | "REFERRAL_APPLIED"
  | "LINKEDIN_OUTREACH"
  | "EMAIL_OUTREACH";

export type Stage =
  | "RESUME_CHECK"
  | "INTERVIEW_REQUEST"
  | "INTERVIEW_STAGE"
  | "WAITING_INTERVIEW_RESULTS"
  | "OFFER_STAGE"
  | "FINALIZED";

export type Outcome =
  | "ACTIVE"
  | "OFFER_ACCEPTED"
  | "OFFER_DECLINED"
  | "REJECTED"
  | "GHOSTED"
  | "WITHDRAWN";

export type Location = "REMOTE" | "NYC_IN_PERSON" | "NYC_HYBRID";

export const SOURCE_CATEGORIES: SourceCategory[] = [
  "SELF_APPLIED",
  "REFERRAL_APPLIED",
  "LINKEDIN_OUTREACH",
  "EMAIL_OUTREACH",
];

export const SOURCE_CATEGORY_LABELS: Record<SourceCategory, string> = {
  SELF_APPLIED: "Self Applied",
  REFERRAL_APPLIED: "Referral Applied",
  LINKEDIN_OUTREACH: "LinkedIn Outreach",
  EMAIL_OUTREACH: "Email Outreach",
};

export const LOCATIONS: { value: Location; label: string }[] = [
  { value: "REMOTE", label: "Remote" },
  { value: "NYC_IN_PERSON", label: "NYC - In person" },
  { value: "NYC_HYBRID", label: "NYC - Hybrid" },
];

export const STAGE_ORDER: Stage[] = [
  "RESUME_CHECK",
  "INTERVIEW_REQUEST",
  "INTERVIEW_STAGE",
  "WAITING_INTERVIEW_RESULTS",
  "OFFER_STAGE",
  "FINALIZED",
];

export const OUTCOMES: Outcome[] = [
  "ACTIVE",
  "OFFER_ACCEPTED",
  "OFFER_DECLINED",
  "REJECTED",
  "GHOSTED",
  "WITHDRAWN",
];

export const STAGE_LABELS: Record<Stage, string> = {
  RESUME_CHECK: "Resume Check",
  INTERVIEW_REQUEST: "Interview Request",
  INTERVIEW_STAGE: "Interview Stage",
  WAITING_INTERVIEW_RESULTS: "Waiting Interview Results",
  OFFER_STAGE: "Offer Stage",
  FINALIZED: "Finalized",
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  ACTIVE: "Active",
  OFFER_ACCEPTED: "Offer Accepted",
  OFFER_DECLINED: "Offer Declined",
  REJECTED: "Rejected",
  GHOSTED: "Ghosted",
  WITHDRAWN: "Withdrawn",
};

export interface LatestInterviewSummary {
  roundId: string;
  interviewDateTime: string;
  interviewType: InterviewType | null;
  roundCount: number;
  meetingLink: string | null;
  location: string | null;
  interviewers: Interviewer[];
}

export interface JobSummary {
  id: number;
  company: string;
  role: string;
  sourceCategory: SourceCategory;
  currentStage: Stage;
  outcome: Outcome;
  url: string | null;
  location: Location | null;
  compMin: number | null;
  compMax: number | null;
  createdAt: string;
  latestInterview: LatestInterviewSummary | null;
}

export interface CreateJobInput {
  company: string;
  role: string;
  sourceCategory: SourceCategory;
  url?: string;
  location?: Location;
  compMin?: number;
  compMax?: number;
  notes?: string;
}

export async function listJobs(): Promise<JobSummary[]> {
  return request<JobSummary[]>("/jobs", "failed to load jobs");
}

export async function createJob(input: CreateJobInput): Promise<JobSummary> {
  return request<JobSummary>("/jobs", "failed to create job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export interface UpdateJobInput {
  company: string;
  role: string;
  sourceCategory: SourceCategory;
  url: string | null;
  location: Location | null;
  compMin: number | null;
  compMax: number | null;
  currentStage: Stage;
  outcome: Outcome;
}

export function toUpdateJobInput(job: JobSummary): UpdateJobInput {
  return {
    company: job.company,
    role: job.role,
    sourceCategory: job.sourceCategory,
    url: job.url,
    location: job.location,
    compMin: job.compMin,
    compMax: job.compMax,
    currentStage: job.currentStage,
    outcome: job.outcome,
  };
}

export async function updateJob(id: number, input: UpdateJobInput): Promise<JobSummary> {
  return request<JobSummary>(`/jobs/${id}`, "failed to update job", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// Fetch live data before a modal save; the opened-modal snapshot may be stale from table autosaves.
export async function getJob(id: number): Promise<JobSummary> {
  return request<JobSummary>(`/jobs/${id}`, "failed to load job");
}

export async function deleteJob(id: number): Promise<void> {
  await request<unknown>(`/jobs/${id}`, "failed to delete job", { method: "DELETE" });
}

export interface StageHistoryEntry {
  stage: Stage;
  enteredAt: string;
  note: string | null;
}

export async function getJobStages(id: number): Promise<StageHistoryEntry[]> {
  const data = await request<{ stageEvents?: StageHistoryEntry[] }>(`/jobs/${id}`, "failed to load job history");
  // request casts without validating; undefined here crashes the modal on .filter a render later.
  if (!Array.isArray(data.stageEvents)) {
    throw new Error("failed to load job history");
  }
  return data.stageEvents;
}

export interface JobDetail {
  jobId: number;
  jdText: string;
  interviewNotes: string;
  recommendedResume: string | null;
  notes: string | null;
  rejectedReason: string | null;
}

export interface UpdateJobDetailInput {
  jdText: string;
  interviewNotes: string;
  // Set once from the Add Job recommendation; omitted on later edits to preserve it.
  recommendedResume?: string;
  notes?: string | null;
  rejectedReason?: string | null;
}

export async function getJobDetail(id: number): Promise<JobDetail> {
  return request<JobDetail>(`/jobs/${id}/detail`, "failed to load job detail");
}

export async function updateJobDetail(id: number, input: UpdateJobDetailInput): Promise<JobDetail> {
  return request<JobDetail>(`/jobs/${id}/detail`, "failed to save job detail", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export interface RulesResumeRecommendation {
  recommendedVariantId: string;
  recommendedDisplayName: string;
  scores: Record<string, number>;
  reason: string;
}

export type AiResumeRecommendation =
  | { status: "ok"; recommendedVariantId: string; recommendedDisplayName: string; reason: string }
  | { status: "not_configured" }
  | { status: "unavailable" };

export interface ResumeRecommendation {
  rules: RulesResumeRecommendation;
  ai: AiResumeRecommendation;
}

export async function getResumeRecommendation(id: number): Promise<ResumeRecommendation> {
  return request<ResumeRecommendation>(`/jobs/${id}/resume-recommendation`, "failed to load resume recommendation");
}

export type RowColor = "red" | "green" | "yellow" | "indigo";

export function rowColor(job: Pick<JobSummary, "outcome" | "currentStage">): RowColor {
  if (job.outcome === "REJECTED" || job.outcome === "GHOSTED" || job.outcome === "WITHDRAWN") {
    return "red";
  }
  if (job.outcome === "OFFER_ACCEPTED" || job.outcome === "OFFER_DECLINED") {
    return "green";
  }
  if (job.currentStage === "WAITING_INTERVIEW_RESULTS") {
    return "indigo";
  }
  if (STAGE_ORDER.indexOf(job.currentStage) >= STAGE_ORDER.indexOf("INTERVIEW_STAGE")) {
    return "green";
  }
  return "yellow";
}
