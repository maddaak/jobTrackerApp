import type { Stage } from "./jobsApi";

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

export const INTERVIEW_TYPES: InterviewType[] = [
  "RECRUITER_PHONE_SCREEN",
  "TECHNICAL_PHONE_SCREEN",
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
  const res = await fetch("/interviews");
  if (!res.ok) {
    throw new Error("failed to load interviews");
  }
  return res.json();
}

export async function createInterview(input: CreateInterviewInput): Promise<Interview> {
  const res = await fetch("/interviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "failed to create interview");
  }
  return data;
}

export async function updateInterview(stageEventId: number, input: UpdateInterviewInput): Promise<Interview> {
  const res = await fetch(`/interviews/${stageEventId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "failed to update interview");
  }
  return data;
}

export async function deleteInterview(stageEventId: number): Promise<void> {
  const res = await fetch(`/interviews/${stageEventId}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "failed to delete interview");
  }
}
