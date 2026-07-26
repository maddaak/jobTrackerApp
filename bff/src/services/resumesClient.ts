import { CORE_URL, INTERNAL_TOKEN } from "../config.js";
import { callCore, type ErrorResponseData, type CoreResult } from "./coreClient.js";

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
  summary: string | null;
  skills: string[] | null;
  seniority: string | null;
  roles: string[] | null;
}

// Multipart upload can't go through callCore (which always JSON.stringifies its body), so
// this builds its own FormData/Blob request to core, matching callCore's result shape.
export async function createResume(
  userId: string,
  fileName: string,
  contentType: string,
  buffer: Buffer,
): Promise<CoreResult<CreateResumeData & Partial<ErrorResponseData>>> {
  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(buffer)], { type: contentType }), fileName);

  const res = await fetch(`${CORE_URL}/resumes`, {
    method: "POST",
    headers: { "X-Internal-Token": INTERNAL_TOKEN, "X-User-Id": userId },
    body: form,
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

export function applyResumeAnalysis(userId: string, resumeId: string, analysisJson: string | null, status: string) {
  return callCore<ResumeSummaryData & Partial<ErrorResponseData>>(`/resumes/${resumeId}/analysis`, {
    method: "PATCH", userId, body: { analysisJson, status },
  });
}

export function listResumes(userId: string) {
  return callCore<ResumeSummaryData[] & Partial<ErrorResponseData>>("/resumes", { userId });
}

export function deleteResume(userId: string, resumeId: string) {
  return callCore<{ deleted: boolean } & Partial<ErrorResponseData>>(`/resumes/${resumeId}`, {
    method: "DELETE", userId,
  });
}
