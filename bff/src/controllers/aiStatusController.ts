import type { Request, Response } from "express";
import { getAiConfigured } from "../services/aiStatusClient.js";

export async function get(_req: Request, res: Response) {
  res.json({ aiConfigured: await getAiConfigured() });
}
