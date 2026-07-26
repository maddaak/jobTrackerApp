import { callCore, type ErrorResponseData } from "./coreClient.js";
import type { InterviewType, InterviewerData } from "./interviewsClient.js";

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

export interface StageEventData {
  stage: Stage;
  enteredAt: string;
  note: string | null;
}

export interface LatestInterviewSummaryData {
  stageEventId: number;
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
  rejectedReason: string | null;
  notes: string | null;
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
  return callCore<JobDetailData & Partial<ErrorResponseData>>(`/jobs/${jobId}`, { userId });
}

export interface UpdateJobData {
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

export function updateJob(userId: string, jobId: string, patch: UpdateJobData) {
  return callCore<JobSummaryData & Partial<ErrorResponseData>>(`/jobs/${jobId}`, {
    method: "PATCH", userId, body: patch,
  });
}

export function deleteJob(userId: string, jobId: string) {
  return callCore<{ deleted: boolean } & Partial<ErrorResponseData>>(`/jobs/${jobId}`, {
    method: "DELETE", userId,
  });
}

export interface JobDetailDocumentData {
  jobId: number;
  jdText: string;
  interviewNotes: string;
}

export interface UpdateJobDetailData {
  jdText: string;
  interviewNotes: string;
}

export function getJobDetail(userId: string, jobId: string) {
  return callCore<JobDetailDocumentData & Partial<ErrorResponseData>>(`/jobs/${jobId}/detail`, { userId });
}

export function updateJobDetail(userId: string, jobId: string, patch: UpdateJobDetailData) {
  return callCore<JobDetailDocumentData & Partial<ErrorResponseData>>(`/jobs/${jobId}/detail`, {
    method: "PUT", userId, body: patch,
  });
}
