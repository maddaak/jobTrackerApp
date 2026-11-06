import { callCore } from "./coreClient.js";

export interface AuthResponseData {
  token: string;
  username: string;
}

export interface RegisterData {
  name: string;
  email: string;
  username: string;
  password: string;
}

export function registerUser(account: RegisterData) {
  return callCore<AuthResponseData>("/auth/register", { method: "POST", body: account });
}

// The address lets core keep an owner's usual address out of a guesser's wait.
export function loginUser(username: string, password: string, address: string | undefined) {
  return callCore<AuthResponseData>("/auth/login", {
    method: "POST",
    body: { username, password },
    clientAddress: address,
  });
}

export function registrationStatus() {
  return callCore<{ open: boolean }>("/auth/registration");
}

export function forgotPassword(username: string) {
  return callCore<void>("/auth/forgot-password", { method: "POST", body: { username } });
}

export function resetPassword(token: string, newPassword: string) {
  return callCore<void>("/auth/reset-password", { method: "POST", body: { token, newPassword } });
}

// Only the terminal script calls this; no route exposes it to a browser.
export function temporaryPassword(username: string) {
  return callCore<{ temporaryPassword: string }>("/auth/temporary-password", { method: "POST", body: { username } });
}
