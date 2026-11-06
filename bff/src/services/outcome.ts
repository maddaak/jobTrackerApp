import type { UpstreamResult } from "./upstream.js";

// What an orchestrating service hands its controller: the answer, or a refusal with the status to send.
// Keeps services free of Express while one rule decides how failures reach the client.
export interface ServiceError {
  status: "error";
  httpStatus: number;
  error: string;
}

export function serviceError(httpStatus: number, error: string): ServiceError {
  return { status: "error", httpStatus, error };
}

export function isServiceError(value: unknown): value is ServiceError {
  return typeof value === "object" && value !== null && (value as { status?: unknown }).status === "error";
}

// An upstream answer's data, or why there isn't any. A 4xx passes its own message through; a 5xx or no
// answer never leaks upstream detail; and an ok answer with no readable body is as unusable as a failure.
export function dataOrError<T>(result: UpstreamResult<T>): T | ServiceError {
  if (result.ok) {
    return result.data !== undefined ? result.data : serviceError(502, "internal error");
  }
  if (result.status >= 500) {
    return serviceError(result.status, "internal error");
  }
  const message = (result.data as { error?: unknown } | undefined)?.error;
  return serviceError(result.status, typeof message === "string" ? message : "request failed");
}
