// Shared fetch wrapper so error handling is identical across every api/*.ts call.
// AuthContext listens for this and clears the user on 401, sending ProtectedRoute to /login.
export const UNAUTHORIZED_EVENT = "auth:unauthorized";

// Distinguishes "the body wasn't JSON" from a body that legitimately parsed to null/{}.
const NOT_JSON = Symbol("not-json");

export async function request<T>(url: string, fallback: string, init?: RequestInit): Promise<T> {
  const res = await (init ? fetch(url, init) : fetch(url));
  const data: unknown = await res.json().catch(() => NOT_JSON);

  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const message = data === NOT_JSON ? undefined : (data as { error?: string })?.error;
    throw new Error(message ?? fallback);
  }

  // A non-JSON 2xx means nginx's SPA rewrite served index.html; {} would crash the caller later.
  if (data === NOT_JSON) {
    if (res.status === 204 || init?.method === "DELETE") {
      return undefined as T;
    }
    throw new Error(fallback);
  }
  return data as T;
}
