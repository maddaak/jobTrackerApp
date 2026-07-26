import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface AuthState {
  username: string | null;
  loading: boolean;
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
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "request failed");
  }
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [username, setUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/auth/me")
      .then(res => (res.ok ? res.json() : null))
      .then(data => setUsername(data?.username ?? null))
      .finally(() => setLoading(false));
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
    <AuthContext.Provider value={{ username, loading, login, register, logout }}>
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
