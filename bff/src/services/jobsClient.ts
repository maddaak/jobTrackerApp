import { callCore } from "./coreClient.js";
import type { InterviewType, InterviewerData } from "./interviewsClient.js";
import type { AiResultData, JobAiKind } from "./aiResultsClient.js";

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

export type InterviewPhase = "INITIAL_SCREEN" | "MID_ROUNDS" | "PANEL";

export type Outcome =
  | "ACTIVE"
  | "OFFER_ACCEPTED"
  | "OFFER_DECLINED"
  | "REJECTED"
  | "GHOSTED"
  | "WITHDRAWN"
  | "POSITION_CLOSED"
  | "PAUSED";

// The work model; where the office is goes in city.
export type Location = "REMOTE" | "ON_SITE" | "HYBRID";

export type JobRelation = "REPLACED_BY" | "REPLACES" | "RELATED";

export interface JobLinkData {
  jobId: number;
  company: string;
  role: string;
  relation: JobRelation;
}

export interface StageEventData {
  stage: Stage;
  enteredAt: string;
  note: string | null;
}

export interface LatestInterviewSummaryData {
  roundId: string;
  interviewDateTime: string;
  interviewEndDateTime: string | null;
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
  // Stored, null until the card is dragged: what a PATCH sends back.
  interviewPhase: InterviewPhase | null;
  // Where the card sits: the drag if any, else the furthest round logged. Display only.
  boardPhase: InterviewPhase | null;
  outcome: Outcome;
  url: string | null;
  location: Location | null;
  city: string | null;
  compMin: number | null;
  compMax: number | null;
  createdAt: string;
  latestInterview: LatestInterviewSummaryData | null;
  needsScheduling: boolean;
  links: JobLinkData[];
  seasonId: number;
}

// Create and get answer with the row and its stage trail; the board fields come only from a list load.
export interface JobDetailData
  extends Omit<JobSummaryData, "interviewPhase" | "boardPhase" | "latestInterview" | "links" | "seasonId"> {
  stageEvents: StageEventData[];
}

export interface CreateJobRequestData {
  company: string;
  role: string;
  sourceCategory: SourceCategory;
  url?: string;
  location?: Location;
  city?: string;
  compMin?: number;
  compMax?: number;
  notes?: string;
  // Omitted means applied; core accepts only RESUME_CHECK or INTERVIEW_REQUEST here.
  startingStage?: Stage;
  jdText?: string;
  recommendedResume?: string;
}

export function createJob(userId: string, request: CreateJobRequestData) {
  return callCore<JobDetailData>("/jobs", { method: "POST", userId, body: request });
}

// Rows from a spreadsheet, matched to fields by the page that read it; core checks and dates them.
export interface ImportJobRowData {
  company: string;
  role: string;
  sourceCategory?: SourceCategory;
  url?: string;
  location?: Location;
  city?: string;
  compMin?: number;
  compMax?: number;
  notes?: string;
  stage?: Stage;
  outcome?: Outcome;
  appliedOn?: string;
  rejectedReason?: string;
}

export function importJobs(userId: string, jobs: ImportJobRowData[]) {
  return callCore<{ imported: number; skipped: number }>("/jobs/import", {
    method: "POST", userId, body: { jobs },
  });
}

export function listJobs(userId: string) {
  return callCore<JobSummaryData[]>("/jobs", { userId });
}

export function getJob(userId: string, jobId: string) {
  return callCore<JobDetailData>(`/jobs/${encodeURIComponent(jobId)}`, { userId });
}

export interface UpdateJobData {
  company: string;
  role: string;
  sourceCategory: SourceCategory;
  url: string | null;
  location: Location | null;
  city: string | null;
  compMin: number | null;
  compMax: number | null;
  currentStage: Stage;
  interviewPhase: InterviewPhase | null;
  outcome: Outcome;
}

export function updateJob(userId: string, jobId: string, patch: UpdateJobData) {
  return callCore<JobSummaryData>(`/jobs/${encodeURIComponent(jobId)}`, {
    method: "PATCH", userId, body: patch,
  });
}

export function deleteJob(userId: string, jobId: string) {
  return callCore<{ deleted: boolean }>(`/jobs/${encodeURIComponent(jobId)}`, {
    method: "DELETE", userId,
  });
}

export function deleteJobStage(userId: string, jobId: string, enteredAt: string, stage: string) {
  return callCore<StageEventData[]>(
    `/jobs/${encodeURIComponent(jobId)}/stages`
      + `?enteredAt=${encodeURIComponent(enteredAt)}&stage=${encodeURIComponent(stage)}`,
    { method: "DELETE", userId },
  );
}

export interface JobDetailDocumentData {
  jobId: number;
  jdText: string;
  interviewNotes: string;
  recommendedResume: string | null;
  notes: string | null;
  rejectedReason: string | null;
  links: JobLinkData[];
  // Only the kinds that have been run.
  aiResults: Partial<Record<JobAiKind, AiResultData>>;
  contacts: ContactData[];
  sentResume: string | null;
}

export interface ContactData {
  name: string;
  role: "RECRUITER" | "HIRING_MANAGER" | "REFERRER" | "INTERVIEWER" | "OTHER";
  email: string | null;
  linkedInUrl: string | null;
  lastContactedOn: string | null;
  notes: string | null;
  followUpOn: string | null;
}

// Every field optional: core leaves an omitted field alone and clears one sent as "".
export interface UpdateJobDetailData {
  jdText?: string;
  interviewNotes?: string;
  recommendedResume?: string;
  notes?: string | null;
  rejectedReason?: string | null;
  contacts?: ContactData[];
  // A resume's file name; "" clears it.
  sentResume?: string;
}

export function getJobDetail(userId: string, jobId: string) {
  return callCore<JobDetailDocumentData>(`/jobs/${encodeURIComponent(jobId)}/detail`, { userId });
}

export function updateJobDetail(userId: string, jobId: string, patch: UpdateJobDetailData) {
  return callCore<JobDetailDocumentData>(`/jobs/${encodeURIComponent(jobId)}/detail`, {
    method: "PUT", userId, body: patch,
  });
}

export interface CreateJobLinkData {
  targetJobId: number;
  relation: JobRelation;
}

export function linkJob(userId: string, jobId: string, body: CreateJobLinkData) {
  return callCore<JobLinkData[]>(`/jobs/${encodeURIComponent(jobId)}/links`, {
    method: "POST", userId, body,
  });
}

export function unlinkJob(userId: string, jobId: string, targetJobId: string) {
  return callCore<JobLinkData[]>(
    `/jobs/${encodeURIComponent(jobId)}/links/${encodeURIComponent(targetJobId)}`,
    { method: "DELETE", userId },
  );
}
