import type { Request, Response } from "express";
import { registerUser, loginUser } from "../services/authClient.js";
import { COOKIE_MAX_AGE_MS, COOKIE_SECURE } from "../config.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

function setAuthCookie(res: Response, token: string) {
  res.cookie("token", token, {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

export async function register(req: Request, res: Response) {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }
  const result = await registerUser(username, password);
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

export async function login(req: Request, res: Response) {
  const { username, password } = req.body ?? {};
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) {
    res.status(400).json({ error: "username and password are required" });
    return;
  }
  const result = await loginUser(username, password);
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

export function logout(_req: Request, res: Response) {
  // Clearing only works when the attributes match those the cookie was set with.
  res.clearCookie("token", { httpOnly: true, secure: COOKIE_SECURE, sameSite: "lax", path: "/" });
  res.json({ status: "ok" });
}

export function me(req: AuthedRequest, res: Response) {
  res.json({ username: req.username });
}
