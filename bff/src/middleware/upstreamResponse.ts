import type { Response } from "express";
import type { CoreResult } from "../services/coreClient.js";

// A 4xx body is a meaningful client error (validation, not-found) so it passes through. A 5xx
// body can leak internal detail, so we replace it with a generic body while keeping the status.
export function sendUpstream<T>(res: Response, result: CoreResult<T>): void {
  if (result.status >= 500) {
    res.status(result.status).json({ error: "internal error" });
    return;
  }
  res.status(result.status).json(result.data);
}
