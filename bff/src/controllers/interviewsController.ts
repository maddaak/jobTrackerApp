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

export async function create(req: AuthedRequest, res: Response) {
  const result = await createInterview(req.userId!, req.body ?? {});
  sendUpstream(res, result);
}

export async function update(req: AuthedRequest, res: Response) {
  const roundId = req.params.id as string;
  const result = await updateInterview(req.userId!, roundId, req.body ?? {});
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
  const roundId = req.params.id as string;
  const result = await deleteInterview(req.userId!, roundId);
  sendUpstream(res, result);
}
