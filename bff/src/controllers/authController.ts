import type { Request, Response } from "express";
import {
  forgotPassword as requestResetLink,
  loginUser,
  registerUser,
  registrationStatus,
  resetPassword as resetWithToken,
  type AuthResponseData,
} from "../services/authClient.js";
import { COOKIE_MAX_AGE_MS } from "../config.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";
import type { UpstreamResult } from "../services/upstream.js";

// Secure whenever the browser reached nginx over https; plain http on localhost has no certificate to set up.
export function setAuthCookie(res: Response, token: string) {
  res.cookie("token", token, {
    httpOnly: true,
    secure: res.req.secure,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

function allStrings(body: Record<string, unknown>, fields: string[]): boolean {
  return fields.every(field => typeof body[field] === "string" && body[field] !== "");
}

export async function register(req: Request, res: Response) {
  const body = req.body ?? {};
  if (!allStrings(body, ["name", "email", "username", "password"])) {
    res.status(400).json({ error: "name, email, username, and password are required" });
    return;
  }
  const { name, email, username, password } = body;
  signIn(res, await registerUser({ name, email, username, password }));
}

export async function login(req: Request, res: Response) {
  const body = req.body ?? {};
  if (!allStrings(body, ["username", "password"])) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }
  signIn(res, await loginUser(body.username, body.password, req.ip));
}

function signIn(res: Response, result: UpstreamResult<AuthResponseData>) {
  if (!result.ok) {
    sendUpstream(res, result);
    return;
  }
  if (!result.data) {
    res.status(502).json({ error: "internal error" });
    return;
  }
  setAuthCookie(res, result.data.token);
  res.json({ username: result.data.username });
}

export async function registration(_req: Request, res: Response) {
  sendUpstream(res, await registrationStatus());
}

export async function forgotPassword(req: Request, res: Response) {
  if (!allStrings(req.body ?? {}, ["username"])) {
    res.status(400).json({ error: "username is required" });
    return;
  }
  const result = await requestResetLink(req.body.username);
  // Core says nothing about whether the account exists, so neither do we; only an outage gets through.
  if (result.status >= 500) {
    sendUpstream(res, result);
    return;
  }
  res.status(202).json({ status: "accepted" });
}

export async function resetPassword(req: Request, res: Response) {
  if (!allStrings(req.body ?? {}, ["token", "newPassword"])) {
    res.status(400).json({ error: "token and newPassword are required" });
    return;
  }
  const result = await resetWithToken(req.body.token, req.body.newPassword);
  if (!result.ok) {
    sendUpstream(res, result);
    return;
  }
  res.json({ status: "ok" });
}

export function logout(req: Request, res: Response) {
  // Clearing only works when the attributes match those the cookie was set with.
  res.clearCookie("token", { httpOnly: true, secure: req.secure, sameSite: "lax", path: "/" });
  res.json({ status: "ok" });
}

export function me(req: AuthedRequest, res: Response) {
  res.json({ username: req.username });
}
