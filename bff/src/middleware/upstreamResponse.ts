import type { Response } from "express";
import type { CoreResult } from "../services/coreClient.js";

// Pass a 4xx body through; replace a 5xx body so internal detail can't leak.
export function sendUpstream<T>(res: Response, result: CoreResult<T>): void {
  if (result.status >= 500) {
    res.status(result.status).json({ error: "internal error" });
    return;
  }
  res.status(result.status).json(result.data);
}
