import { CORE_URL, SCRAPER_URL, INTERNAL_TOKEN, CORE_TIMEOUT_MS } from "../config.js";

export interface CoreResult<T> {
  ok: boolean;
  status: number;
  // Optional because an empty/non-JSON upstream body (a 204, an HTML error page) leaves
  // nothing to parse, and a transport failure never gets a body at all. Callers that need
  // the body must check it before dereferencing.
  data?: T;
}

export interface ErrorResponseData {
  error: string;
}

interface CallCoreOptions {
  method?: string;
  userId?: string;
  body?: unknown;
}

export async function callCore<T>(path: string, options: CallCoreOptions = {}): Promise<CoreResult<T>> {
  const headers: Record<string, string> = { "X-Internal-Token": INTERNAL_TOKEN };
  if (options.userId) headers["X-User-Id"] = options.userId;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  // A network error or the AbortSignal.timeout firing rejects the fetch. Turn that into a
  // non-ok result (504 on timeout, 502 otherwise) so callers can degrade gracefully instead
  // of the rejection propagating up and surfacing every transport blip as a generic 500.
  let res: globalThis.Response;
  try {
    res = await fetch(`${CORE_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: AbortSignal.timeout(CORE_TIMEOUT_MS),
    });
  } catch (err) {
    const status = err instanceof DOMException && err.name === "TimeoutError" ? 504 : 502;
    return { ok: false, status, data: undefined };
  }

  // A 204/empty body or an upstream HTML error page makes res.json() throw. Swallow it and
  // leave data undefined so the real res.ok/res.status still reaches the caller.
  let data: T | undefined = undefined;
  try {
    data = (await res.json()) as T;
  } catch {
    data = undefined;
  }
  return { ok: res.ok, status: res.status, data };
}

export async function checkHealth(url: string) {
  try {
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(CORE_TIMEOUT_MS) });
    return await res.json();
  } catch {
    // Return status only. The internal url must never be echoed to a client.
    return { status: "unreachable" };
  }
}

export function checkCoreHealth() {
  return checkHealth(CORE_URL);
}

export function checkScraperHealth() {
  return checkHealth(SCRAPER_URL);
}
