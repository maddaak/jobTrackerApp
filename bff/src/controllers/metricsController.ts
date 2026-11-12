import type { Response } from "express";
import { getMetrics, getSeasonStats, getSeasonSummary } from "../services/metricsClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

export async function get(req: AuthedRequest, res: Response) {
  const result = await getMetrics(req.userId!);
  sendUpstream(res, result);
}

export async function seasons(req: AuthedRequest, res: Response) {
  sendUpstream(res, await getSeasonStats(req.userId!));
}

export async function seasonSummary(req: AuthedRequest, res: Response) {
  sendUpstream(res, await getSeasonSummary(req.userId!, req.params.id as string));
}
