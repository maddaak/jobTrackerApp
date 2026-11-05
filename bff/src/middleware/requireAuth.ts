import { AsyncLocalStorage, AsyncResource } from "node:async_hooks";
import type { Request, Response, NextFunction, RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";
import { checkSession } from "../services/accountClient.js";
import { sendUpstream } from "./upstreamResponse.js";

export interface TokenPayload {
  sub: string;
  username: string;
  // The account's session version when signed; core refuses one that's behind. Absent before V4, read as 0.
  ver?: number;
}

// Held for the rest of the request, so every call to core carries it without each caller passing it on.
const session = new AsyncLocalStorage<{ userId: string; version: number }>();

export function currentSessionVersion(): number | undefined {
  return session.getStore()?.version;
}

export function currentUserId(): string | undefined {
  return session.getStore()?.userId;
}

export interface AuthedRequest extends Request {
  userId?: string;
  username?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  // Already checked for this request (a path guarded at the app and again by its router).
  if (req.userId !== undefined && currentUserId() === req.userId) {
    next();
    return;
  }
  const token = req.cookies?.token as string | undefined;
  if (!token) {
    res.status(401).json({ error: "missing auth cookie" });
    return;
  }
  let payload: Partial<TokenPayload>;
  try {
    payload = jwt.verify(token, JWT_SECRET, { algorithms: ["HS512"] }) as Partial<TokenPayload>;
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
    return;
  }
  // Every handler relies on userId; a signed token without one would reach core with no X-User-Id.
  if (typeof payload.sub !== "string" || !payload.sub) {
    res.status(401).json({ error: "invalid or expired token" });
    return;
  }
  req.userId = payload.sub;
  req.username = payload.username;
  const userId = payload.sub;
  session.run({ userId, version: typeof payload.ver === "number" ? payload.ver : 0 }, async () => {
    // Every route, not only those reaching core, so a token signed out since can't use one that forgot to ask.
    const current = await checkSession(userId);
    if (!current.ok) {
      sendUpstream(res, current);
      return;
    }
    next();
  });
}

// multer calls next from the upload stream's events, which drop the session; without it core can't refuse a signed-out token.
export function keepSession(middleware: RequestHandler): RequestHandler {
  return (req, res, next) => middleware(req, res, AsyncResource.bind(next));
}
