import { INTERNAL_TOKEN, SCRAPER_TOKEN, SCRAPER_URL } from "../config.js";
import { currentSessionVersion } from "../middleware/requireAuth.js";

// Every client goes through here so the internal token, user id, timeout, and no-answer rule
// are applied in one place.

export interface UpstreamResult<T> {
  ok: boolean;
  status: number;
  // Undefined on an empty/non-JSON body or a transport failure; check before use.
  data?: T;
}

export interface UpstreamRequest {
  method?: string;
  userId?: string;
  clientAddress?: string;
  // One body or neither: JSON for ordinary calls, a form for file uploads, raw bytes passed on unread.
  json?: unknown;
  form?: FormData;
  raw?: { body: Buffer; contentType: string };
  timeoutMs: number;
}

type Sent = { answered: true; response: Response } | { answered: false; status: 502 | 504 };

async function send(url: string, request: UpstreamRequest): Promise<Sent> {
  const headers: Record<string, string> = {
    "X-Internal-Token": url.startsWith(SCRAPER_URL) ? SCRAPER_TOKEN : INTERNAL_TOKEN,
  };
  if (request.userId) headers["X-User-Id"] = request.userId;
  if (request.clientAddress) headers["X-Client-Address"] = request.clientAddress;
  // So core can refuse a session signed out since; a call outside a signed-in request sends none.
  const version = currentSessionVersion();
  if (request.userId && version !== undefined) headers["X-Session-Version"] = String(version);
  if (request.json !== undefined) headers["Content-Type"] = "application/json";
  if (request.raw) headers["Content-Type"] = request.raw.contentType;
  const body = request.json !== undefined ? JSON.stringify(request.json)
    : request.raw ? new Uint8Array(request.raw.body) : request.form;
  try {
    const response = await fetch(url, {
      method: request.method ?? "GET",
      headers,
      body,
      signal: AbortSignal.timeout(request.timeoutMs),
    });
    return { answered: true, response };
  } catch (err) {
    return { answered: false, status: err instanceof DOMException && err.name === "TimeoutError" ? 504 : 502 };
  }
}

export async function callUpstream<T>(url: string, request: UpstreamRequest): Promise<UpstreamResult<T>> {
  const sent = await send(url, request);
  if (!sent.answered) return { ok: false, status: sent.status };
  // An empty or non-JSON body leaves data undefined, but the real status still goes back.
  const data = (await sent.response.json().catch(() => undefined)) as T | undefined;
  return { ok: sent.response.ok, status: sent.response.status, data };
}

export interface BinaryResult {
  ok: boolean;
  status: number;
  // Set only when ok.
  file?: { body: Buffer; contentType: string; contentDisposition?: string };
}

export async function fetchUpstreamBytes(url: string, request: UpstreamRequest): Promise<BinaryResult> {
  const sent = await send(url, request);
  if (!sent.answered) return { ok: false, status: sent.status };
  const { response } = sent;
  if (!response.ok) return { ok: false, status: response.status };
  return {
    ok: true,
    status: response.status,
    file: {
      body: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type") ?? "application/octet-stream",
      // Core builds this from the sanitized stored name; without it a save uses the id from the URL.
      contentDisposition: response.headers.get("content-disposition") ?? undefined,
    },
  };
}
