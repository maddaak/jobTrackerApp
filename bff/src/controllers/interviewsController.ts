import type { Response } from "express";
import {
  createInterview,
  updateInterview,
  listInterviews,
  listUpcomingInterviews,
  deleteInterview,
} from "../services/interviewsClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

// Stage event ids are always numeric. Reject anything else before it reaches an upstream URL path.
const NUMERIC_ID = /^\d+$/;

export async function create(req: AuthedRequest, res: Response) {
  const result = await createInterview(req.userId!, req.body ?? {});
  sendUpstream(res, result);
}

export async function update(req: AuthedRequest, res: Response) {
  const stageEventId = req.params.id as string;
  if (!NUMERIC_ID.test(stageEventId)) {
    res.status(400).json({ error: "invalid interview id" });
    return;
  }
  const result = await updateInterview(req.userId!, stageEventId, req.body ?? {});
  sendUpstream(res, result);
}

export async function list(req: AuthedRequest, res: Response) {
  const result = await listInterviews(req.userId!);
  sendUpstream(res, result);
}

export async function upcoming(req: AuthedRequest, res: Response) {
  const result = await listUpcomingInterviews(req.userId!);
  sendUpstream(res, result);
}

export async function remove(req: AuthedRequest, res: Response) {
  const stageEventId = req.params.id as string;
  if (!NUMERIC_ID.test(stageEventId)) {
    res.status(400).json({ error: "invalid interview id" });
    return;
  }
  const result = await deleteInterview(req.userId!, stageEventId);
  sendUpstream(res, result);
}
