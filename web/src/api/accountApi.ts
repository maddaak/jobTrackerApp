import { request } from "./request";

export interface Account {
  username: string;
  // Null on an account made before V4 until filled in under Profile.
  name: string | null;
  email: string | null;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function getAccount(): Promise<Account> {
  return request<Account>("/account", "failed to load your account");
}

// The current password is needed only to change the email, since reset links go there.
export async function updateAccount(name: string, email: string, currentPassword?: string): Promise<Account> {
  return request<Account>("/account", "failed to save your account", json("PUT", { name, email, currentPassword }));
}

// Signs out every other device; this one gets a fresh session and stays signed in.
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await request("/account/password", "failed to change your password", json("PUT", { currentPassword, newPassword }));
}

export async function signOutOtherDevices(): Promise<void> {
  await request("/account/sessions/end-others", "failed to sign out your other devices", { method: "POST" });
}

// Closed once the app has its first account, unless the owner opens it in .env.
export async function registrationOpen(): Promise<boolean> {
  return (await request<{ open: boolean }>("/auth/registration", "failed to check registration")).open;
}

export async function forgotPassword(username: string): Promise<void> {
  await request("/auth/forgot-password", "failed to send the reset email", json("POST", { username }));
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await request("/auth/reset-password", "failed to reset your password", json("POST", { token, newPassword }));
}

// A plain link, so the browser saves the file itself; nginx lets this path through as a download.
export const EXPORT_URL = "/account/export";

export interface RestoreResult {
  jobs: number;
  images: number;
  resumes: number;
}

export async function restoreBackup(file: File): Promise<RestoreResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  return request<RestoreResult>("/account/restore", "failed to restore the backup", { method: "POST", body: form });
}

// A made-up search to look around with; core marks its jobs so removing them never touches a real one.
// The sample jobs in the season shown, and whether the account is empty enough to load the sample.
export async function sampleStatus(): Promise<{ jobs: number; canLoad: boolean }> {
  return request<{ jobs: number; canLoad: boolean }>("/account/sample", "failed to check for sample data");
}

export async function loadSampleData(): Promise<number> {
  return (await request<{ jobs: number }>("/account/sample", "failed to load the sample data", { method: "POST" })).jobs;
}

export async function removeSampleData(): Promise<number> {
  return (await request<{ removed: number }>("/account/sample", "failed to remove the sample data", { method: "DELETE" })).removed;
}

// The fallback when email isn't set up: run on the machine the app is on.
export const TERMINAL_RESET_COMMAND = "docker compose exec bff node dist/scripts/resetPassword.js <username>";
