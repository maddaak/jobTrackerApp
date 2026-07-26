import type { Response } from "express";
import { createJob, listJobs, getJob, updateJob, deleteJob, getJobDetail, updateJobDetail } from "../services/jobsClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";

export async function create(req: AuthedRequest, res: Response) {
  const result = await createJob(req.userId!, req.body ?? {});
  res.status(result.status).json(result.data);
}

export async function list(req: AuthedRequest, res: Response) {
  const result = await listJobs(req.userId!);
  res.status(result.status).json(result.data);
}

export async function get(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const result = await getJob(req.userId!, jobId);
  res.status(result.status).json(result.data);
}

export async function update(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const result = await updateJob(req.userId!, jobId, req.body ?? {});
  res.status(result.status).json(result.data);
}

export async function remove(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const result = await deleteJob(req.userId!, jobId);
  res.status(result.status).json(result.data);
}

export async function getDetail(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const result = await getJobDetail(req.userId!, jobId);
  res.status(result.status).json(result.data);
}

export async function updateDetail(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const result = await updateJobDetail(req.userId!, jobId, req.body ?? {});
  res.status(result.status).json(result.data);
}
