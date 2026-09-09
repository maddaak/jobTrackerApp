import type { Response } from "express";
import {
  createJob,
  listJobs,
  getJob,
  updateJob,
  deleteJob,
  getJobDetail,
  updateJobDetail,
  getResumeRecommendation,
  linkJob,
  unlinkJob,
  deleteJobStage,
} from "../services/jobsClient.js";
import { recommendResumeVariant } from "../services/scraperAnalysisClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

export async function create(req: AuthedRequest, res: Response) {
  const result = await createJob(req.userId!, req.body ?? {});
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

// Returns rules (core) and AI (scraper) picks side by side so they can be compared for now.
export async function getResumeRecommendationForJob(req: AuthedRequest, res: Response) {
  const jobId = req.params.id as string;

  const [rulesResult, detailResult] = await Promise.all([
    getResumeRecommendation(req.userId!, jobId),
    getJobDetail(req.userId!, jobId),
  ]);
  if (!rulesResult.ok) {
    sendUpstream(res, rulesResult);
    return;
  }
  if (!detailResult.ok) {
    sendUpstream(res, detailResult);
    return;
  }
  // callCore leaves data undefined on an empty/non-JSON body even when ok.
  if (!detailResult.data || !rulesResult.data) {
    res.status(502).json({ error: "internal error" });
    return;
  }

  const aiResult = await recommendResumeVariant(detailResult.data.jdText, rulesResult.data.variants);
  // An id matching no variant means the model picked nothing; the raw id would look like a real pick.
  const picked =
    aiResult.status === "ok"
      ? rulesResult.data.variants.find(v => v.id === aiResult.data.variantId)
      : undefined;
  const ai =
    aiResult.status !== "ok"
      ? { status: aiResult.status }
      : !picked
        ? { status: "unavailable" }
        : {
            status: "ok",
            recommendedVariantId: picked.id,
            recommendedDisplayName: picked.displayName,
            reason: aiResult.data.reason,
          };

  res.json({
    rules: {
      recommendedVariantId: rulesResult.data.recommendedVariantId,
      recommendedDisplayName: rulesResult.data.recommendedDisplayName,
      scores: rulesResult.data.scores,
      reason: rulesResult.data.reason,
    },
    ai,
  });
}
