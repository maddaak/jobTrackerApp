import type { InterviewType, Interviewer } from "./interviewsApi";

export type SourceCategory =
  | "SELF_APPLIED"
  | "REFERRAL_APPLIED"
  | "LINKEDIN_OUTREACH"
  | "EMAIL_OUTREACH";

export type Stage =
  | "RESUME_CHECK"
  | "RECRUITER_CHAT_INVITE"
  | "RECRUITER_CHAT_SCHEDULED"
  | "WAITING_RECRUITER_RESPONSE"
  | "INTERVIEW_SCHEDULING"
  | "INTERVIEW_STAGE"
  | "WAITING_INTERVIEW_RESULTS"
  | "OFFER_EXTENDED"
  | "WAITING_OFFER_DETAILS"
  | "NEGOTIATION"
  | "WAITING_FINAL_DETAILS";

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
  "RECRUITER_CHAT_INVITE",
  "RECRUITER_CHAT_SCHEDULED",
  "WAITING_RECRUITER_RESPONSE",
  "INTERVIEW_SCHEDULING",
  "INTERVIEW_STAGE",
  "WAITING_INTERVIEW_RESULTS",
  "OFFER_EXTENDED",
  "WAITING_OFFER_DETAILS",
  "NEGOTIATION",
  "WAITING_FINAL_DETAILS",
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
  RECRUITER_CHAT_INVITE: "Recruiter Chat Invite",
  RECRUITER_CHAT_SCHEDULED: "Recruiter Chat Scheduled",
  WAITING_RECRUITER_RESPONSE: "Waiting Recruiter Response",
  INTERVIEW_SCHEDULING: "Interview Scheduling",
  INTERVIEW_STAGE: "Interview Stage",
  WAITING_INTERVIEW_RESULTS: "Waiting Interview Results",
  OFFER_EXTENDED: "Offer Extended",
  WAITING_OFFER_DETAILS: "Waiting Offer Details",
  NEGOTIATION: "Negotiation",
  WAITING_FINAL_DETAILS: "Waiting Final Details",
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
  stageEventId: number;
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
  rejectedReason: string | null;
  notes: string | null;
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
  const res = await fetch("/jobs");
  if (!res.ok) {
    throw new Error("failed to load jobs");
  }
  return res.json();
}

export async function createJob(input: CreateJobInput): Promise<JobSummary> {
  const res = await fetch("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "failed to create job");
  }
  return data;
}

export interface UpdateJobInput {
  company: string;
  role: string;
  sourceCategory: SourceCategory;
  url: string | null;
  location: Location | null;
  compMin: number | null;
  compMax: number | null;
  notes: string | null;
  currentStage: Stage;
  outcome: Outcome;
  rejectedReason: string | null;
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
    notes: job.notes,
    currentStage: job.currentStage,
    outcome: job.outcome,
    rejectedReason: job.rejectedReason,
  };
}

export async function updateJob(id: number, input: UpdateJobInput): Promise<JobSummary> {
  const res = await fetch(`/jobs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "failed to update job");
  }
  return data;
}

export async function deleteJob(id: number): Promise<void> {
  const res = await fetch(`/jobs/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "failed to delete job");
  }
}

export interface JobDetail {
  jobId: number;
  jdText: string;
  interviewNotes: string;
}

export interface UpdateJobDetailInput {
  jdText: string;
  interviewNotes: string;
}

export async function getJobDetail(id: number): Promise<JobDetail> {
  const res = await fetch(`/jobs/${id}/detail`);
  if (!res.ok) {
    throw new Error("failed to load job detail");
  }
  return res.json();
}

export async function updateJobDetail(id: number, input: UpdateJobDetailInput): Promise<JobDetail> {
  const res = await fetch(`/jobs/${id}/detail`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "failed to save job detail");
  }
  return data;
}

export function rowColor(job: Pick<JobSummary, "outcome" | "currentStage">): "red" | "green" | "yellow" {
  if (job.outcome === "REJECTED" || job.outcome === "GHOSTED" || job.outcome === "WITHDRAWN") {
    return "red";
  }
  if (job.outcome === "OFFER_ACCEPTED" || job.outcome === "OFFER_DECLINED") {
    return "green";
  }
  if (STAGE_ORDER.indexOf(job.currentStage) >= STAGE_ORDER.indexOf("INTERVIEW_SCHEDULING")) {
    return "green";
  }
  return "yellow";
}
