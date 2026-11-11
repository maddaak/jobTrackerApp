import type { Response } from "express";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { createResume, listResumes, deleteResume } from "../services/resumesClient.js";
import { setCustomSummary as saveCustomSummary, summarizeResume } from "../services/resumeAnalysis.js";
import { matchJobToResumes } from "../services/resumeMatching.js";
import { sendOutcome, sendUpstream } from "../middleware/upstreamResponse.js";

// Upload only stores the file; it stays "pending" until AI or custom summary runs.
export async function create(req: AuthedRequest, res: Response) {
  if (!req.file) {
    res.status(400).json({ error: "file is required" });
    return;
  }
  sendUpstream(res, await createResume(req.userId!, req.file.originalname, req.file.mimetype, req.file.buffer));
}

export async function summarize(req: AuthedRequest, res: Response) {
  sendOutcome(res, await summarizeResume(req.userId!, req.params.id as string));
}

export async function setCustomSummary(req: AuthedRequest, res: Response) {
  // typeof first: a non-string body used to reach .trim() and 500.
  const summary = typeof req.body?.summary === "string" ? req.body.summary.trim() : "";
  if (!summary) {
    res.status(400).json({ error: "summary is required" });
    return;
  }
  sendOutcome(res, await saveCustomSummary(req.userId!, req.params.id as string, summary));
}

export async function list(req: AuthedRequest, res: Response) {
  sendUpstream(res, await listResumes(req.userId!));
}

export async function remove(req: AuthedRequest, res: Response) {
  sendUpstream(res, await deleteResume(req.userId!, req.params.id as string));
}

export async function match(req: AuthedRequest, res: Response) {
  const jobDescriptionText = req.body?.jobDescriptionText;
  if (typeof jobDescriptionText !== "string" || !jobDescriptionText.trim()) {
    res.status(400).json({ error: "jobDescriptionText is required" });
    return;
  }
  sendOutcome(res, await matchJobToResumes(req.userId!, jobDescriptionText));
}
