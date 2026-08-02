import type { Response } from "express";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { createResume, applyResumeAnalysis, getResumeText, listResumes, deleteResume } from "../services/resumesClient.js";
import { analyzeResume, matchResume } from "../services/scraperAnalysisClient.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

// Upload only stores the file; it stays "pending" until the user picks AI or custom summary,
// so the file survives even if that next step is skipped or fails.
export async function create(req: AuthedRequest, res: Response) {
  if (!req.file) {
    res.status(400).json({ error: "file is required" });
    return;
  }

  const created = await createResume(req.userId!, req.file.originalname, req.file.mimetype, req.file.buffer);
  sendUpstream(res, created);
}

// Text comes from core, never the client. Cache the failure status too (not_configured /
// unavailable), not just a successful analysis, so the stored resume always reflects reality.
export async function summarize(req: AuthedRequest, res: Response) {
  const resumeId = req.params.id as string;

  const textResult = await getResumeText(req.userId!, resumeId);
  if (!textResult.ok) {
    sendUpstream(res, textResult);
    return;
  }
  // core reported success but callCore leaves data undefined on an empty/non-JSON body.
  // Guard before dereferencing so we return a clean error instead of a TypeError.
  if (!textResult.data) {
    res.status(502).json({ error: "internal error" });
    return;
  }

  const analysis = await analyzeResume(textResult.data.extractedText);
  const patched = await applyResumeAnalysis(
    req.userId!,
    resumeId,
    analysis.status === "ok" ? JSON.stringify(analysis.data) : null,
    analysis.status,
    analysis.status === "ok" ? "ai" : null,
  );

  sendUpstream(res, patched);
}

// User-written alternative to summarize(): stores their text directly, no scraper call.
export async function setCustomSummary(req: AuthedRequest, res: Response) {
  const resumeId = req.params.id as string;
  const summary = ((req.body ?? {}).summary as string | undefined)?.trim();
  if (!summary) {
    res.status(400).json({ error: "summary is required" });
    return;
  }

  const analysisJson = JSON.stringify({ summary, skills: [], seniority: null, roles: [] });
  const patched = await applyResumeAnalysis(req.userId!, resumeId, analysisJson, "ok", "custom");

  sendUpstream(res, patched);
}

export async function list(req: AuthedRequest, res: Response) {
  const result = await listResumes(req.userId!);
  sendUpstream(res, result);
}

export async function remove(req: AuthedRequest, res: Response) {
  const resumeId = req.params.id as string;
  const result = await deleteResume(req.userId!, resumeId);
  sendUpstream(res, result);
}

// Sends full resume text, not the cached summary: condensed summaries caused inconsistent picks
// across identical calls (smoke-tested: summaries flipped 3 ways in 3 calls, full text 5/5 same).
export async function match(req: AuthedRequest, res: Response) {
  const jobDescriptionText = (req.body ?? {}).jobDescriptionText as string | undefined;
  if (!jobDescriptionText || !jobDescriptionText.trim()) {
    res.status(400).json({ error: "jobDescriptionText is required" });
    return;
  }

  const resumesResult = await listResumes(req.userId!);
  if (!resumesResult.ok) {
    sendUpstream(res, resumesResult);
    return;
  }
  // core reported success but callCore leaves data undefined on an empty/non-JSON body.
  // Guard before dereferencing so we return a clean error instead of a TypeError.
  if (!resumesResult.data) {
    res.status(502).json({ error: "internal error" });
    return;
  }
  const analyzed = resumesResult.data.filter(r => r.analysisStatus === "ok" && r.summary);
  if (analyzed.length === 0) {
    res.json({ status: "no_resumes" });
    return;
  }

  const documents = await Promise.all(
    analyzed.map(async r => {
      const textResult = await getResumeText(req.userId!, r.id);
      const fullText = textResult.ok && textResult.data ? textResult.data.extractedText : "";
      return { id: r.id, fileName: r.fileName, fullText };
    }),
  );

  const result = await matchResume(jobDescriptionText, documents);
  if (result.status !== "ok") {
    res.json({ status: result.status });
    return;
  }

  // The scraper returns INSUFFICIENT_JD when the text it was given isn't actually a job
  // description (nav markup, JSON, cookie text). Surface that as its own status so the UI
  // prompts for a real paste instead of painting a red "do not apply" verdict on garbage.
  if (result.data.recommendation === "INSUFFICIENT_JD") {
    res.json({ status: "insufficient_jd" });
    return;
  }

  const best = analyzed.find(r => r.id === result.data.bestResumeId);
  res.json({
    status: "ok",
    fileName: best?.fileName ?? "unknown resume",
    recommendation: result.data.recommendation,
    reasoning: result.data.reasoning,
  });
}
