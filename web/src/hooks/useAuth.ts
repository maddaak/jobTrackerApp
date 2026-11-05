import { createContext, useContext } from "react";

// Apart from AuthProvider so its file exports only a component, which fast refresh needs.
export interface AuthState {
  username: string | null;
  loading: boolean;
  aiConfigured: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (account: NewAccount) => Promise<void>;
  logout: () => Promise<void>;
}

export interface NewAccount {
  name: string;
  email: string;
  username: string;
  password: string;
}

export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
