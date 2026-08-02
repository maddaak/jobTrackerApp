import type { Stage } from "./jobsApi";
import { request } from "./request";

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
  | "PANEL_VALUES";

export const INTERVIEW_TYPES: InterviewType[] = [
  "RECRUITER_PHONE_SCREEN",
  "TECHNICAL_PHONE_SCREEN",
  "TAKE_HOME_ASSIGNMENT",
  "TECHNICAL_CODE_REVIEW",
  "HIRING_MANAGER_SCREEN",
  "SYSTEM_DESIGN",
  "BEHAVIOR",
  "CULTURE_FIT",
  "VALUES",
  "PANEL_CODING",
  "PANEL_SYSTEM_DESIGN",
  "PANEL_BEHAVIOR",
  "PANEL_CULTURE_FIT",
  "PANEL_VALUES",
];

export const INTERVIEW_TYPE_LABELS: Record<InterviewType, string> = {
  RECRUITER_PHONE_SCREEN: "Recruiter Phone Screen",
  TECHNICAL_PHONE_SCREEN: "Technical Phone Screen",
  TAKE_HOME_ASSIGNMENT: "Take Home Assignment",
  TECHNICAL_CODE_REVIEW: "Technical Code Review",
  HIRING_MANAGER_SCREEN: "Hiring Manager Screen",
  SYSTEM_DESIGN: "System Design",
  BEHAVIOR: "Behavior",
  CULTURE_FIT: "Culture Fit",
  VALUES: "Values",
  PANEL_CODING: "Panel - Coding",
  PANEL_SYSTEM_DESIGN: "Panel - System Design",
  PANEL_BEHAVIOR: "Panel - Behavior",
  PANEL_CULTURE_FIT: "Panel - Culture Fit",
  PANEL_VALUES: "Panel - Values",
};

export interface Interviewer {
  id: number;
  name: string;
  linkedInUrl: string | null;
}

export interface InterviewerInput {
  name: string;
  linkedInUrl?: string;
}

export interface Interview {
  stageEventId: number;
  jobId: number;
  company: string;
  role: string;
  stage: Stage;
  interviewDateTime: string;
  interviewType: InterviewType | null;
  meetingLink: string | null;
  location: string | null;
  interviewers: Interviewer[];
}

export interface CreateInterviewInput {
  jobId: number;
  stage: Stage;
  interviewDateTime: string;
  interviewType?: InterviewType;
  meetingLink?: string;
  location?: string;
  interviewers?: InterviewerInput[];
}

export interface UpdateInterviewInput {
  interviewDateTime: string;
  interviewType: InterviewType | null;
  meetingLink: string | null;
  location: string | null;
  interviewers: InterviewerInput[];
}

export function googleMapsUrl(location: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
}

export async function listInterviews(): Promise<Interview[]> {
  return request<Interview[]>("/interviews", "failed to load interviews");
}

export async function listUpcomingInterviews(): Promise<Interview[]> {
  return request<Interview[]>("/interviews/upcoming", "failed to load upcoming interviews");
}

export async function createInterview(input: CreateInterviewInput): Promise<Interview> {
  return request<Interview>("/interviews", "failed to create interview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function updateInterview(stageEventId: number, input: UpdateInterviewInput): Promise<Interview> {
  return request<Interview>(`/interviews/${stageEventId}`, "failed to update interview", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteInterview(stageEventId: number): Promise<void> {
  await request<unknown>(`/interviews/${stageEventId}`, "failed to delete interview", { method: "DELETE" });
}
