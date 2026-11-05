import { BACKUP_TIMEOUT_MS, CORE_URL } from "../config.js";
import type { AuthResponseData } from "./authClient.js";
import { callCore } from "./coreClient.js";
import { callUpstream, fetchUpstreamBytes } from "./upstream.js";

export interface RestoreResultData {
  jobs: number;
  images: number;
  resumes: number;
}

export function exportBackup(userId: string) {
  return fetchUpstreamBytes(`${CORE_URL}/account/export`, { userId, timeoutMs: BACKUP_TIMEOUT_MS });
}

// Passed on as the file's bytes: core reads the backup itself, so the bff never holds it twice.
export function restoreBackup(userId: string, file: Buffer) {
  return callUpstream<RestoreResultData>(`${CORE_URL}/account/restore`, {
    method: "POST", userId, raw: { body: file, contentType: "application/json" }, timeoutMs: BACKUP_TIMEOUT_MS,
  });
}

export interface AccountData {
  username: string;
  // Null on an account made before V4 until filled in.
  name: string | null;
  email: string | null;
}

export function getAccount(userId: string) {
  return callCore<AccountData>("/account", { userId });
}

// currentPassword only when the email changes, since reset links go there.
export function updateAccount(userId: string, account: { name: string; email: string; currentPassword?: string }) {
  return callCore<AccountData>("/account", { method: "PUT", userId, body: account });
}

export function countSampleJobs(userId: string) {
  return callCore<{ jobs: number; canLoad: boolean }>("/account/sample", { userId });
}

export function loadSample(userId: string) {
  return callCore<{ jobs: number }>("/account/sample", { method: "POST", userId });
}

export function removeSample(userId: string) {
  return callCore<{ removed: number }>("/account/sample", { method: "DELETE", userId });
}

// Both end every other session and hand back a token for this one, so it stays signed in.
export function changePassword(userId: string, currentPassword: string, newPassword: string) {
  return callCore<AuthResponseData>("/account/password", { method: "PUT", userId, body: { currentPassword, newPassword } });
}

// 204 while the session is current; core's session check answers 401 once it's been signed out.
export function checkSession(userId: string) {
  return callCore<void>("/account/session", { userId });
}

export function endOtherSessions(userId: string) {
  return callCore<AuthResponseData>("/account/sessions/end-others", { method: "POST", userId });
}
