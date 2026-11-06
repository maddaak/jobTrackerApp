import { CORE_URL, CORE_TIMEOUT_MS } from "../config.js";
import { callUpstream, type UpstreamResult } from "./upstream.js";

export interface CallCoreOptions {
  method?: string;
  userId?: string;
  body?: unknown;
  // Instead of body, for file uploads.
  form?: FormData;
  clientAddress?: string;
}

export function callCore<T>(path: string, options: CallCoreOptions = {}): Promise<UpstreamResult<T>> {
  return callUpstream<T>(`${CORE_URL}${path}`, {
    method: options.method,
    userId: options.userId,
    clientAddress: options.clientAddress,
    json: options.body,
    form: options.form,
    timeoutMs: CORE_TIMEOUT_MS,
  });
}
