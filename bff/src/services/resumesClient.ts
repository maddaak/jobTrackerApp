import { callCore } from "./coreClient.js";

export interface CreateResumeData {
  id: string;
  fileName: string;
  extractedText: string;
  uploadedAt: string;
}

export interface ResumeSummaryData {
  id: string;
  fileName: string;
  uploadedAt: string;
  analysisStatus: "pending" | "ok" | "not_configured" | "unavailable";
  analysisSource: "ai" | "custom" | null;
  summary: string | null;
  skills: string[] | null;
  seniority: string | null;
  roles: string[] | null;
}

export interface ResumeTextData {
  id: string;
  extractedText: string;
}

export function createResume(userId: string, fileName: string, contentType: string, buffer: Buffer) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), fileName);
  return callCore<CreateResumeData>("/resumes", { method: "POST", userId, form });
}

export function applyResumeAnalysis(
  userId: string,
  resumeId: string,
  analysisJson: string | null,
  status: string,
  source: string | null,
) {
  return callCore<ResumeSummaryData>(`/resumes/${encodeURIComponent(resumeId)}/analysis`, {
    method: "PATCH", userId, body: { analysisJson, status, source },
  });
}

export function getResumeText(userId: string, resumeId: string) {
  return callCore<ResumeTextData>(`/resumes/${encodeURIComponent(resumeId)}/text`, { userId });
}

export function listResumes(userId: string) {
  return callCore<ResumeSummaryData[]>("/resumes", { userId });
}

export function deleteResume(userId: string, resumeId: string) {
  return callCore<{ deleted: boolean }>(`/resumes/${encodeURIComponent(resumeId)}`, {
    method: "DELETE", userId,
  });
}
