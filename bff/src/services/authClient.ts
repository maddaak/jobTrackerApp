import { callCore, type ErrorResponseData } from "./coreClient.js";

export interface AuthResponseData {
  token: string;
  username: string;
}

export function registerUser(username: string, password: string) {
  return callCore<AuthResponseData & Partial<ErrorResponseData>>("/auth/register", {
    method: "POST",
    body: { username, password },
  });
}

export function loginUser(username: string, password: string) {
  return callCore<AuthResponseData & Partial<ErrorResponseData>>("/auth/login", {
    method: "POST",
    body: { username, password },
  });
}
