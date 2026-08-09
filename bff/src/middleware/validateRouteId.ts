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

// Numeric job ids, opaque resume ids, and the uuid an embedded round carries instead of a row id.
export const NUMERIC_ID = /^\d+$/;
export const RESUME_ID = /^[A-Za-z0-9_-]{1,64}$/;
export const ROUND_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
