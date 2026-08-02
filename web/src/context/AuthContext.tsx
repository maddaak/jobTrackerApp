import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { UNAUTHORIZED_EVENT } from "../api/request";
import { getAiConfigured } from "../api/config";

interface AuthState {
  username: string | null;
  loading: boolean;
  // Whether the backend has an Anthropic key; when false, AI features are hidden entirely.
  aiConfigured: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

async function postJson(path: string, body: unknown) {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? "request failed");
  }
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiConfigured, setAiConfigured] = useState(false);

  useEffect(() => {
    getAiConfigured().then(setAiConfigured);
  }, []);

  useEffect(() => {
    fetch("/auth/me")
      .then(res => (res.ok ? res.json() : null))
      .then(data => setUsername(data?.username ?? null))
      // A network failure or a non-JSON body (e.g. a proxy 502 HTML page) must not surface
      // as an unhandled rejection; treat any failure as "not authenticated".
      .catch(() => setUsername(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // A 401 from any API call means the session expired. Clear the user so ProtectedRoute
    // redirects to /login instead of leaving the user staring at generic error banners.
    function handleUnauthorized() {
      setUsername(null);
    }
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized);
  }, []);

  async function login(usernameInput: string, password: string) {
    const data = await postJson("/auth/login", { username: usernameInput, password });
    setUsername(data.username);
  }

  async function register(usernameInput: string, password: string) {
    const data = await postJson("/auth/register", { username: usernameInput, password });
    setUsername(data.username);
  }

  async function logout() {
    await fetch("/auth/logout", { method: "POST" });
    setUsername(null);
  }

  return (
    <AuthContext.Provider value={{ username, loading, aiConfigured, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
