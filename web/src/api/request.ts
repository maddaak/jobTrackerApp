// Shared fetch wrapper so error handling is identical across every api/*.ts call.
// AuthContext listens for this and clears the user on 401, sending ProtectedRoute to /login.
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
