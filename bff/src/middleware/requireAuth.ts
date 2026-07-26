import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { JWT_SECRET } from "../config.js";

export interface TokenPayload {
  sub: string;
  username: string;
}

export interface AuthedRequest extends Request {
  userId?: string;
  username?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.token as string | undefined;
  if (!token) {
    res.status(401).json({ error: "missing auth cookie" });
    return;
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
    req.userId = payload.sub;
    req.username = payload.username;
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
