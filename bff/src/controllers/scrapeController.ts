import type { Response } from "express";
import { scrape } from "../services/scrapeClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";

export async function create(req: AuthedRequest, res: Response) {
  const url = (req.body ?? {}).url as string | undefined;
  if (!url || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "url must be http or https" });
    return;
  }
  const result = await scrape(url);
  res.status(result.status).json(result.data);
}
