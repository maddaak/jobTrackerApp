import { CORE_URL, CORE_TIMEOUT_MS } from "../config.js";
import { callCore } from "./coreClient.js";
import { fetchUpstreamBytes } from "./upstream.js";

export interface JobImageData {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

function imagesPath(jobId: string) {
  return `/jobs/${encodeURIComponent(jobId)}/images`;
}

export function listJobImages(userId: string, jobId: string) {
  return callCore<JobImageData[]>(imagesPath(jobId), { userId });
}

export function deleteJobImage(userId: string, jobId: string, imageId: string) {
  return callCore<{ deleted: boolean }>(`${imagesPath(jobId)}/${encodeURIComponent(imageId)}`, {
    method: "DELETE", userId,
  });
}

export function uploadJobImage(userId: string, jobId: string, fileName: string, contentType: string, buffer: Buffer) {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(buffer)], { type: contentType }), fileName);
  return callCore<JobImageData>(imagesPath(jobId), { method: "POST", userId, form });
}

export function downloadJobImage(userId: string, jobId: string, imageId: string) {
  return fetchUpstreamBytes(`${CORE_URL}${imagesPath(jobId)}/${encodeURIComponent(imageId)}`, {
    userId,
    timeoutMs: CORE_TIMEOUT_MS,
  });
}
