import type { Response } from "express";
import { getMetrics } from "../services/metricsClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

export async function get(req: AuthedRequest, res: Response) {
  const result = await getMetrics(req.userId!);
  sendUpstream(res, result);
}
