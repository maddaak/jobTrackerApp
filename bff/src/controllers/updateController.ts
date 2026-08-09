import type { Response } from "express";
import { getUpdateStatus } from "../services/updateClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";

export async function get(_req: AuthedRequest, res: Response) {
  res.json(await getUpdateStatus());
}
