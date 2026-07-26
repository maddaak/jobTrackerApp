import type { Request, Response } from "express";
import { registerUser, loginUser } from "../services/authClient.js";
import { COOKIE_MAX_AGE_MS } from "../config.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";

function setAuthCookie(res: Response, token: string) {
  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE_MS,
  });
}

export async function register(req: Request, res: Response) {
  const { username, password } = req.body ?? {};
  const result = await registerUser(username, password);
  if (!result.ok) {
    res.status(result.status).json(result.data);
    return;
  }
  setAuthCookie(res, result.data.token);
  res.json({ username: result.data.username });
}

export async function login(req: Request, res: Response) {
  const { username, password } = req.body ?? {};
  const result = await loginUser(username, password);
  if (!result.ok) {
    res.status(result.status).json(result.data);
    return;
  }
  setAuthCookie(res, result.data.token);
  res.json({ username: result.data.username });
}

export function logout(_req: Request, res: Response) {
  res.clearCookie("token");
  res.json({ status: "ok" });
}

export function me(req: AuthedRequest, res: Response) {
  res.json({ username: req.username });
}
