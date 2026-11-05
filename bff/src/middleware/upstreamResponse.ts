import type { Response } from "express";
import { isServiceError, type ServiceError } from "../services/outcome.js";
import type { UpstreamResult } from "../services/upstream.js";

export function sendOutcome<T>(res: Response, outcome: T | ServiceError): void {
  if (isServiceError(outcome)) {
    res.status(outcome.httpStatus).json({ error: outcome.error });
    return;
  }
  res.json(outcome);
}

// Pass a 4xx body through; replace a 5xx body so internal detail can't leak.
export function sendUpstream<T>(res: Response, result: UpstreamResult<T>): void {
  if (result.status >= 500) {
    res.status(result.status).json({ error: "internal error" });
    return;
  }
  res.status(result.status).json(result.data);
}
