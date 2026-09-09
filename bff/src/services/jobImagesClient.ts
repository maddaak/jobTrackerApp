import { CORE_URL, INTERNAL_TOKEN, CORE_TIMEOUT_MS } from "../config.js";
import { callCore, type CoreResult, type ErrorResponseData } from "./coreClient.js";

export interface JobImageData {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export function listJobImages(userId: string, jobId: string) {
  return callCore<JobImageData[] & Partial<ErrorResponseData>>(
    `/jobs/${encodeURIComponent(jobId)}/images`, { userId });
}

export function deleteJobImage(userId: string, jobId: string, imageId: string) {
  return callCore<{ deleted: boolean } & Partial<ErrorResponseData>>(
    `/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(imageId)}`,
    { method: "DELETE", userId },
  );
}

// Multipart can't use callCore, which only sends JSON; mirrors createResume's shape.
export async function uploadJobImage(
  userId: string,
  jobId: string,
  fileName: string,
  contentType: string,
  buffer: Buffer,
): Promise<CoreResult<JobImageData & Partial<ErrorResponseData>>> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), fileName);

  let res: globalThis.Response;
  try {
    res = await fetch(`${CORE_URL}/jobs/${encodeURIComponent(jobId)}/images`, {
      method: "POST",
      headers: { "X-Internal-Token": INTERNAL_TOKEN, "X-User-Id": userId },
      body: form,
      signal: AbortSignal.timeout(CORE_TIMEOUT_MS),
    });
  } catch (err) {
    const status = err instanceof DOMException && err.name === "TimeoutError" ? 504 : 502;
    return { ok: false, status, data: undefined };
  }
  const data = await res.json().catch(() => undefined);
  return { ok: res.ok, status: res.status, data };
}

export interface BinaryResult {
  ok: boolean;
  status: number;
  contentType?: string;
  contentDisposition?: string;
  body?: Buffer;
}

// The only route returning bytes rather than JSON, so callCore can't serve it.
export async function downloadJobImage(
  userId: string,
  jobId: string,
  imageId: string,
): Promise<BinaryResult> {
  let res: globalThis.Response;
  try {
    res = await fetch(
      `${CORE_URL}/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(imageId)}`,
      {
        headers: { "X-Internal-Token": INTERNAL_TOKEN, "X-User-Id": userId },
        signal: AbortSignal.timeout(CORE_TIMEOUT_MS),
      },
    );
  } catch (err) {
    const status = err instanceof DOMException && err.name === "TimeoutError" ? 504 : 502;
    return { ok: false, status };
  }
  if (!res.ok) {
    return { ok: false, status: res.status };
  }
  return {
    ok: true,
    status: res.status,
    contentType: res.headers.get("content-type") ?? "application/octet-stream",
    // Core builds this from the sanitized stored name; without it a save uses the id from the URL.
    contentDisposition: res.headers.get("content-disposition") ?? undefined,
    body: Buffer.from(await res.arrayBuffer()),
  };
}
