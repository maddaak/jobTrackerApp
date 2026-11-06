import type { Request, Response } from "express";
import { getUpdateStatus } from "../services/updateClient.js";

export async function get(_req: Request, res: Response) {
  res.json(await getUpdateStatus());
}
