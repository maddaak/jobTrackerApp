import { request } from "./request";

export type AnalysisStatus = "pending" | "ok" | "not_configured" | "unavailable";
export type AnalysisSource = "ai" | "custom" | null;

export interface ResumeSummary {
  id: string;
  fileName: string;
  uploadedAt: string;
  analysisStatus: AnalysisStatus;
  analysisSource: AnalysisSource;
  summary: string | null;
  skills: string[] | null;
  seniority: string | null;
  roles: string[] | null;
}

export interface UploadedResume {
  id: string;
  fileName: string;
  uploadedAt: string;
}

export type MatchResult =
  | { status: "ok"; fileName: string; recommendation: "APPLY" | "DO_NOT_APPLY"; reasoning: string }
  | { status: "no_resumes" }
  | { status: "not_configured" }
  | { status: "unavailable" }
  | { status: "insufficient_jd" };

export async function uploadResume(file: File): Promise<UploadedResume> {
  const form = new FormData();
  form.append("file", file, file.name);
  return request<UploadedResume>("/resumes", "failed to upload resume", { method: "POST", body: form });
}

export async function summarizeResume(id: string): Promise<ResumeSummary> {
  return request<ResumeSummary>(`/resumes/${id}/summarize`, "failed to summarize resume", { method: "POST" });
}

export async function setCustomResumeSummary(id: string, summary: string): Promise<ResumeSummary> {
  return request<ResumeSummary>(`/resumes/${id}/custom-summary`, "failed to save custom summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ summary }),
  });
}

export async function listResumes(): Promise<ResumeSummary[]> {
  return request<ResumeSummary[]>("/resumes", "failed to load resumes");
}

export async function deleteResume(id: string): Promise<void> {
  await request<unknown>(`/resumes/${id}`, "failed to delete resume", { method: "DELETE" });
}

export async function matchResumeToJob(jobDescriptionText: string): Promise<MatchResult> {
  return request<MatchResult>("/resumes/match", "failed to get recommendation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobDescriptionText }),
  });
}
