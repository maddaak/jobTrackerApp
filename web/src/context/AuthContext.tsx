import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { UNAUTHORIZED_EVENT } from "../api/request";
import { getAiConfigured } from "../api/config";

interface AuthState {
  username: string | null;
  loading: boolean;
  // When false, AI features are hidden entirely.
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
      // Treat any failure (network, non-JSON body) as "not authenticated".
      .catch(() => setUsername(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // 401 means the session expired; clear the user so ProtectedRoute redirects to /login.
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
