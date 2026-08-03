import type { Request, Response, NextFunction } from "express";

// Route ids reach an upstream URL path, so they must match a fixed shape first.
export function validateRouteId(pattern: RegExp, errorMessage: string) {
  return (_req: Request, res: Response, next: NextFunction, value: string) => {
    if (!pattern.test(value)) {
      res.status(400).json({ error: errorMessage });
      return;
    }
    next();
  };
}

// Numeric ids (jobs, interviews) and opaque uuid-like resume ids.
export const NUMERIC_ID = /^\d+$/;
export const RESUME_ID = /^[A-Za-z0-9_-]{1,64}$/;
