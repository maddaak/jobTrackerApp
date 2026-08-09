import { callCore, type ErrorResponseData } from "./coreClient.js";
import type { InterviewType, InterviewerData } from "./interviewsClient.js";

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

export interface StageEventData {
  stage: Stage;
  enteredAt: string;
  note: string | null;
}

export interface LatestInterviewSummaryData {
  roundId: string;
  interviewDateTime: string;
  interviewType: InterviewType | null;
  roundCount: number;
  meetingLink: string | null;
  location: string | null;
  interviewers: InterviewerData[];
}

export interface JobSummaryData {
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
  latestInterview: LatestInterviewSummaryData | null;
}

export interface JobDetailData extends JobSummaryData {
  stageEvents: StageEventData[];
}

export interface CreateJobRequestData {
  company: string;
  role: string;
  sourceCategory: SourceCategory;
  url?: string;
  location?: Location;
  compMin?: number;
  compMax?: number;
  notes?: string;
}

export function createJob(userId: string, request: CreateJobRequestData) {
  return callCore<JobDetailData & Partial<ErrorResponseData>>("/jobs", { method: "POST", userId, body: request });
}

export function listJobs(userId: string) {
  return callCore<JobSummaryData[] & Partial<ErrorResponseData>>("/jobs", { userId });
}

export function getJob(userId: string, jobId: string) {
  return callCore<JobDetailData & Partial<ErrorResponseData>>(`/jobs/${encodeURIComponent(jobId)}`, { userId });
}

export interface UpdateJobData {
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

export function updateJob(userId: string, jobId: string, patch: UpdateJobData) {
  return callCore<JobSummaryData & Partial<ErrorResponseData>>(`/jobs/${encodeURIComponent(jobId)}`, {
    method: "PATCH", userId, body: patch,
  });
}

export function deleteJob(userId: string, jobId: string) {
  return callCore<{ deleted: boolean } & Partial<ErrorResponseData>>(`/jobs/${encodeURIComponent(jobId)}`, {
    method: "DELETE", userId,
  });
}

export interface JobDetailDocumentData {
  jobId: number;
  jdText: string;
  interviewNotes: string;
  recommendedResume: string | null;
  notes: string | null;
  rejectedReason: string | null;
}

export interface UpdateJobDetailData {
  jdText: string;
  interviewNotes: string;
  recommendedResume?: string;
  notes?: string | null;
  rejectedReason?: string | null;
}

export function getJobDetail(userId: string, jobId: string) {
  return callCore<JobDetailDocumentData & Partial<ErrorResponseData>>(`/jobs/${encodeURIComponent(jobId)}/detail`, { userId });
}

export function updateJobDetail(userId: string, jobId: string, patch: UpdateJobDetailData) {
  return callCore<JobDetailDocumentData & Partial<ErrorResponseData>>(`/jobs/${encodeURIComponent(jobId)}/detail`, {
    method: "PUT", userId, body: patch,
  });
}

export interface ResumeVariantSummaryData {
  id: string;
  displayName: string;
  blurb: string;
}

export interface ResumeRecommendationData {
  recommendedVariantId: string;
  recommendedDisplayName: string;
  scores: Record<string, number>;
  reason: string;
  variants: ResumeVariantSummaryData[];
}

export function getResumeRecommendation(userId: string, jobId: string) {
  return callCore<ResumeRecommendationData & Partial<ErrorResponseData>>(`/jobs/${encodeURIComponent(jobId)}/resume-recommendation`, {
    userId,
  });
}
