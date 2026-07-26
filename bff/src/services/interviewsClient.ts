import { callCore, type ErrorResponseData } from "./coreClient.js";
import type { Stage } from "./jobsClient.js";

export type InterviewType =
  | "RECRUITER_PHONE_SCREEN"
  | "TECHNICAL_PHONE_SCREEN"
  | "HIRING_MANAGER_SCREEN"
  | "SYSTEM_DESIGN"
  | "BEHAVIOR"
  | "CULTURE_FIT"
  | "VALUES"
  | "PANEL_CODING"
  | "PANEL_SYSTEM_DESIGN"
  | "PANEL_BEHAVIOR"
  | "PANEL_CULTURE_FIT"
  | "PANEL_VALUES";

export interface InterviewerData {
  id: number;
  name: string;
  linkedInUrl: string | null;
}

export interface InterviewerInput {
  name: string;
  linkedInUrl?: string;
}

export interface InterviewData {
  stageEventId: number;
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
  interviewType?: InterviewType;
  meetingLink?: string;
  location?: string;
  interviewers?: InterviewerInput[];
}

export interface UpdateInterviewData {
  interviewDateTime: string;
  interviewType: InterviewType | null;
  meetingLink: string | null;
  location: string | null;
  interviewers: InterviewerInput[];
}

export function createInterview(userId: string, request: CreateInterviewData) {
  return callCore<InterviewData & Partial<ErrorResponseData>>("/interviews", {
    method: "POST", userId, body: request,
  });
}

export function updateInterview(userId: string, stageEventId: string, patch: UpdateInterviewData) {
  return callCore<InterviewData & Partial<ErrorResponseData>>(`/interviews/${stageEventId}`, {
    method: "PATCH", userId, body: patch,
  });
}

export function listInterviews(userId: string) {
  return callCore<InterviewData[] & Partial<ErrorResponseData>>("/interviews", { userId });
}

export function deleteInterview(userId: string, stageEventId: string) {
  return callCore<{ deleted: boolean } & Partial<ErrorResponseData>>(`/interviews/${stageEventId}`, {
    method: "DELETE", userId,
  });
}
