import { callCore, type ErrorResponseData } from "./coreClient.js";
import type { Stage } from "./jobsClient.js";

export type InterviewType =
  | "RECRUITER_PHONE_SCREEN"
  | "TECHNICAL_PHONE_SCREEN"
  | "TAKE_HOME_ASSIGNMENT"
  | "TECHNICAL_CODE_REVIEW"
  | "HIRING_MANAGER_SCREEN"
  | "SYSTEM_DESIGN"
  | "BEHAVIOR"
  | "CULTURE_FIT"
  | "VALUES"
  | "PANEL_CODING"
  | "PANEL_SYSTEM_DESIGN"
  | "PANEL_BEHAVIOR"
  | "PANEL_CULTURE_FIT"
  | "PANEL_VALUES"
  | "RECRUITER_DEBRIEF";

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
  interviewType: InterviewType | null;
  meetingLink: string | null;
  location: string | null;
  interviewers: InterviewerData[];
}

export interface CreateInterviewData {
  jobId: number;
  stage: Stage;
  interviewDateTime: string;
  interviewType: InterviewType;
  meetingLink?: string;
  location?: string;
  interviewers?: InterviewerInput[];
}

export interface UpdateInterviewData {
  interviewDateTime: string;
  interviewType: InterviewType;
  meetingLink: string | null;
  location: string | null;
  interviewers: InterviewerInput[];
}

export function createInterview(userId: string, request: CreateInterviewData) {
  return callCore<InterviewData & Partial<ErrorResponseData>>("/interviews", {
    method: "POST", userId, body: request,
  });
}

export function updateInterview(userId: string, roundId: string, patch: UpdateInterviewData) {
  return callCore<InterviewData & Partial<ErrorResponseData>>(`/interviews/${encodeURIComponent(roundId)}`, {
    method: "PATCH", userId, body: patch,
  });
}

export function listInterviews(userId: string) {
  return callCore<InterviewData[] & Partial<ErrorResponseData>>("/interviews", { userId });
}

export function listUpcomingInterviews(userId: string) {
  return callCore<InterviewData[] & Partial<ErrorResponseData>>("/interviews/upcoming", { userId });
}

export function deleteInterview(userId: string, roundId: string) {
  return callCore<{ deleted: boolean } & Partial<ErrorResponseData>>(`/interviews/${encodeURIComponent(roundId)}`, {
    method: "DELETE", userId,
  });
}
