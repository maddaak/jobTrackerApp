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

// Multipart upload can't use callCore (JSON-only body), so it builds its own request matching callCore's shape.
export async function createResume(
  userId: string,
  fileName: string,
  contentType: string,
  buffer: Buffer,
): Promise<CoreResult<CreateResumeData & Partial<ErrorResponseData>>> {
  const form = new FormData();
  form.append("file", new Blob([Uint8Array.from(buffer)], { type: contentType }), fileName);

  // Turn a fetch rejection into a real 5xx (504 timeout, 502 otherwise) instead of a generic 500.
  let res: globalThis.Response;
  try {
    res = await fetch(`${CORE_URL}/resumes`, {
      method: "POST",
      headers: { "X-Internal-Token": INTERNAL_TOKEN, "X-User-Id": userId },
      body: form,
      signal: AbortSignal.timeout(CORE_TIMEOUT_MS),
    });
  } catch (err) {
    const status = err instanceof DOMException && err.name === "TimeoutError" ? 504 : 502;
    return { ok: false, status, data: undefined };
  }
  // Empty/non-JSON body must not throw over the real status.
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
