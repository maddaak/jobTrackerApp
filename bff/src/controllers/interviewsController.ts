import type { Response } from "express";
import { createInterview, updateInterview, listInterviews, deleteInterview } from "../services/interviewsClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";

export async function create(req: AuthedRequest, res: Response) {
  const result = await createInterview(req.userId!, req.body ?? {});
  res.status(result.status).json(result.data);
}

export async function update(req: AuthedRequest, res: Response) {
  const stageEventId = req.params.id as string;
  const result = await updateInterview(req.userId!, stageEventId, req.body ?? {});
  res.status(result.status).json(result.data);
}

export async function list(req: AuthedRequest, res: Response) {
  const result = await listInterviews(req.userId!);
  res.status(result.status).json(result.data);
}

export async function remove(req: AuthedRequest, res: Response) {
  const stageEventId = req.params.id as string;
  const result = await deleteInterview(req.userId!, stageEventId);
  res.status(result.status).json(result.data);
}
