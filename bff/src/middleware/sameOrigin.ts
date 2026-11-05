import type { Request, Response, NextFunction } from "express";

const READS = new Set(["GET", "HEAD", "OPTIONS"]);

// SameSite=Lax still sends the cookie from another port or a sibling subdomain, since those count as the
// same site. Browsers say where a request came from, so a change from anywhere but the app is refused.
// No header means a client that isn't a browser (curl, the smoke test), which carries no one's cookie by accident.
export function sameOrigin(req: Request, res: Response, next: NextFunction) {
  const site = req.get("Sec-Fetch-Site");
  if (READS.has(req.method) || site === undefined || site === "same-origin" || site === "none") {
    next();
    return;
  }
  res.status(403).json({ error: "refused a change sent from another site" });
}
