import { request } from "./request";

export interface JobImage {
  id: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
}

export async function listJobImages(jobId: number): Promise<JobImage[]> {
  return request<JobImage[]>(`/jobs/${jobId}/images`, "failed to load attachments");
}

export async function uploadJobImage(jobId: number, file: File): Promise<JobImage> {
  const form = new FormData();
  form.append("file", file, file.name);
  // No Content-Type header: the browser has to set the multipart boundary itself.
  return request<JobImage>(`/jobs/${jobId}/images`, "failed to upload attachment", {
    method: "POST",
    body: form,
  });
}

export async function deleteJobImage(jobId: number, imageId: string): Promise<void> {
  await request<unknown>(`/jobs/${jobId}/images/${imageId}`, "failed to delete attachment", {
    method: "DELETE",
  });
}

// A plain URL, so opening one is a normal navigation the browser can cache and render itself.
export function jobImageUrl(jobId: number, imageId: string): string {
  return `/jobs/${jobId}/images/${imageId}`;
}

export function formatFileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
