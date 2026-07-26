import type { Request, Response } from "express";
import { checkCoreHealth, checkScraperHealth } from "../services/coreClient.js";

export function health(_req: Request, res: Response) {
  res.json({ status: "ok", service: "bff" });
}

export async function healthDeep(_req: Request, res: Response) {
  const [core, scraper] = await Promise.all([checkCoreHealth(), checkScraperHealth()]);
  res.json({ bff: "ok", core, scraper });
}
