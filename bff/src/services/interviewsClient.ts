import { callCore } from "./coreClient.js";
import type { Stage } from "./jobsClient.js";
import type { AiResultData, RoundAiKind } from "./aiResultsClient.js";

// A list, not just a type, so a prep request for an unknown type is refused before it's billed.
export const INTERVIEW_TYPES = [
  "RECRUITER_PHONE_SCREEN",
  "TECHNICAL_PHONE_SCREEN",
  "TAKE_HOME_ASSIGNMENT",
  "TECHNICAL_CODE_REVIEW",
  "HIRING_MANAGER_SCREEN",
  "SYSTEM_DESIGN",
  "DATA_MODELING",
  "BEHAVIOR",
  "CULTURE_FIT",
  "VALUES",
  "PANEL_CODING",
  "PANEL_SYSTEM_DESIGN",
  "PANEL_BEHAVIOR",
  "PANEL_CULTURE_FIT",
  "PANEL_VALUES",
  "PANEL_HIRING_MANAGER_CHAT",
  "PANEL_PRODUCT_XFN",
  "PANEL_TECHNICAL_DEMO",
  "PANEL_TECHNICAL_DEEP_DIVE",
  "RECRUITER_DEBRIEF",
] as const;
export type InterviewType = (typeof INTERVIEW_TYPES)[number];

export interface InterviewerData {
  name: string;
  linkedInUrl: string | null;
}

export interface InterviewerInput {
  name: string;
  linkedInUrl?: string;
}

export interface InterviewData {
  roundId: string;
  jobId: number;
  company: string;
  role: string;
  stage: Stage;
  interviewDateTime: string;
  // Null on rounds recorded before end times existed, and whenever the length was not given.
  interviewEndDateTime: string | null;
  interviewType: InterviewType | null;
  meetingLink: string | null;
  location: string | null;
  interviewers: InterviewerData[];
  // Only the kinds that have been run.
  aiResults: Partial<Record<RoundAiKind, AiResultData>>;
}

// No stage: core decides what logging a round does to the job.
export interface CreateInterviewData {
  jobId: number;
  interviewDateTime: string;
  interviewEndDateTime?: string;
  interviewType: InterviewType;
  meetingLink?: string;
  location?: string;
  interviewers?: InterviewerInput[];
}

export interface UpdateInterviewData {
  interviewDateTime: string;
  interviewEndDateTime: string | null;
  interviewType: InterviewType;
  meetingLink: string | null;
  location: string | null;
  interviewers: InterviewerInput[];
}

export function createInterview(userId: string, request: CreateInterviewData) {
  return callCore<InterviewData>("/interviews", {
    method: "POST", userId, body: request,
  });
}

export function updateInterview(userId: string, roundId: string, patch: UpdateInterviewData) {
  return callCore<InterviewData>(`/interviews/${encodeURIComponent(roundId)}`, {
    method: "PATCH", userId, body: patch,
  });
}

export function listInterviews(userId: string) {
  return callCore<InterviewData[]>("/interviews", { userId });
}

export function listUpcomingInterviews(userId: string) {
  return callCore<InterviewData[]>("/interviews/upcoming", { userId });
}

export function deleteInterview(userId: string, roundId: string) {
  return callCore<{ deleted: boolean }>(`/interviews/${encodeURIComponent(roundId)}`, {
    method: "DELETE", userId,
  });
}
