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
  | {
    status: "ok";
    fileName: string;
    recommendation: "APPLY" | "DO_NOT_APPLY";
    // As the posting names them; empty when it doesn't say.
    company: string;
    role: string;
    strengths: string[];
    gaps: string[];
    // Resumes that couldn't be read and so weren't weighed; absent when every resume was.
    skippedResumes?: number;
  }
  | { status: "no_resumes" }
  | { status: "not_configured" }
  | { status: "unavailable" }
  | { status: "insufficient_jd" };

// accept only constrains the browse picker; a drag-drop can hand over any file, so check before uploading.
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function resumeFileProblem(file: File): string | null {
  if (!ALLOWED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext))) {
    return "Unsupported file type: upload a PDF, DOCX, or TXT.";
  }
  if (file.size > MAX_FILE_BYTES) return "File is too large: the maximum is 10 MB.";
  return null;
}

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
