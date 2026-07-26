import { CORE_URL, SCRAPER_URL, INTERNAL_TOKEN } from "../config.js";

export interface CoreResult<T> {
  ok: boolean;
  status: number;
  data: T;
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

  const res = await fetch(`${CORE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const data = (await res.json()) as T;
  return { ok: res.ok, status: res.status, data };
}

export async function checkHealth(url: string) {
  try {
    const res = await fetch(`${url}/health`);
    return await res.json();
  } catch {
    return { status: "unreachable", url };
  }
}

export function checkCoreHealth() {
  return checkHealth(CORE_URL);
}

export function checkScraperHealth() {
  return checkHealth(SCRAPER_URL);
}
