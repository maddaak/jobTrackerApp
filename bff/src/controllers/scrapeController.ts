import type { Request, Response } from "express";
import { readText, scrape } from "../services/scrapeClient.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

// A long posting fits; anything bigger is not a job description.
const MAX_PASTE_CHARS = 50_000;

// Only the scheme is checked here. Refusing internal hosts is the scraper's job: it checks the address it
// actually dials, after DNS and on every redirect, which no hostname check here could match.
export async function create(req: Request, res: Response) {
  const url = req.body?.url;
  if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
    res.status(400).json({ error: "url must be http or https" });
    return;
  }
  sendUpstream(res, await scrape(url));
}

export async function fromText(req: Request, res: Response) {
  const text = req.body?.text;
  if (typeof text !== "string" || text.trim() === "" || text.length > MAX_PASTE_CHARS) {
    res.status(400).json({ error: `text must be a description of at most ${MAX_PASTE_CHARS} characters` });
    return;
  }
  sendUpstream(res, await readText(text));
}
