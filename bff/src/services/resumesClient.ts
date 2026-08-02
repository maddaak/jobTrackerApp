import { CORE_URL, INTERNAL_TOKEN, CORE_TIMEOUT_MS } from "../config.js";
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
    signal: AbortSignal.timeout(CORE_TIMEOUT_MS),
  });
  // Parse defensively, matching callCore: an empty or non-JSON upstream body must not
  // throw and swallow the real status.
  const data = await res.json().catch(() => undefined);
  return { ok: res.ok, status: res.status, data };
}

export function applyResumeAnalysis(
  userId: string,
  resumeId: string,
  analysisJson: string | null,
  status: string,
  source: string | null,
) {
  return callCore<ResumeSummaryData & Partial<ErrorResponseData>>(`/resumes/${encodeURIComponent(resumeId)}/analysis`, {
    method: "PATCH", userId, body: { analysisJson, status, source },
  });
}

export function getResumeText(userId: string, resumeId: string) {
  return callCore<ResumeTextData & Partial<ErrorResponseData>>(`/resumes/${encodeURIComponent(resumeId)}/text`, { userId });
}

export function listResumes(userId: string) {
  return callCore<ResumeSummaryData[] & Partial<ErrorResponseData>>("/resumes", { userId });
}

export function deleteResume(userId: string, resumeId: string) {
  return callCore<{ deleted: boolean } & Partial<ErrorResponseData>>(`/resumes/${encodeURIComponent(resumeId)}`, {
    method: "DELETE", userId,
  });
}
