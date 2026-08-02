// Shared fetch wrapper for every api/*.ts call, so error handling is identical across reads,
// mutations, and the scrape endpoint instead of three separate variants.
//
// `init` is passed through only when present so plain GETs still call fetch(url) with a single
// argument, matching the calls the rest of the app (and the tests) expect.
// Fired when any API call comes back 401, i.e. the session cookie expired mid-session.
// AuthContext listens for this and clears the user, which sends ProtectedRoute to /login.
export const UNAUTHORIZED_EVENT = "auth:unauthorized";

export async function request<T>(url: string, fallback: string, init?: RequestInit): Promise<T> {
  const res = await (init ? fetch(url, init) : fetch(url));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    throw new Error(data.error ?? fallback);
  }
  return data as T;
}
