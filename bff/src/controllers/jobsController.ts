import type { Response } from "express";
import {
  createJob,
  importJobs,
  listJobs,
  getJob,
  updateJob,
  deleteJob,
  getJobDetail,
  updateJobDetail,
  linkJob,
  unlinkJob,
  deleteJobStage,
} from "../services/jobsClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

export async function create(req: AuthedRequest, res: Response) {
  const result = await createJob(req.userId!, req.body ?? {});
  sendUpstream(res, result);
}

export async function importRows(req: AuthedRequest, res: Response) {
  const jobs = req.body?.jobs;
  if (!Array.isArray(jobs)) {
    res.status(400).json({ error: "send the rows as a jobs list" });
    return;
  }
  const result = await importJobs(req.userId!, jobs);
  sendUpstream(res, result);
}

export async function list(req: AuthedRequest, res: Response) {
  const result = await listJobs(req.userId!);
  sendUpstream(res, result);
}

export async function get(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const result = await getJob(req.userId!, jobId);
  sendUpstream(res, result);
}

export async function update(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const result = await updateJob(req.userId!, jobId, req.body ?? {});
  sendUpstream(res, result);
}

export async function remove(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const result = await deleteJob(req.userId!, jobId);
  sendUpstream(res, result);
}

export async function getDetail(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const result = await getJobDetail(req.userId!, jobId);
  sendUpstream(res, result);
}

export async function updateDetail(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const result = await updateJobDetail(req.userId!, jobId, req.body ?? {});
  sendUpstream(res, result);
}

// Both reach an upstream URL, so they must match a fixed shape first.
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?Z$/;
const ENUM_NAME = /^[A-Z_]{1,40}$/;

export async function removeStage(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const enteredAt = req.query.enteredAt;
  if (typeof enteredAt !== "string" || !ISO_INSTANT.test(enteredAt)) {
    res.status(400).json({ error: "invalid enteredAt" });
    return;
  }
  // Two entries can share a millisecond, so the stage says which of them the row stands for.
  const stage = req.query.stage;
  if (typeof stage !== "string" || !ENUM_NAME.test(stage)) {
    res.status(400).json({ error: "invalid stage" });
    return;
  }
  const result = await deleteJobStage(req.userId!, jobId, enteredAt, stage);
  sendUpstream(res, result);
}

export async function addLink(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const result = await linkJob(req.userId!, jobId, req.body ?? {});
  sendUpstream(res, result);
}

export async function removeLink(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;
  const targetJobId = req.params.targetId as string;
  const result = await unlinkJob(req.userId!, jobId, targetJobId);
  sendUpstream(res, result);
}
