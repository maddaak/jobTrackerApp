import type { Response } from "express";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { createResume, applyResumeAnalysis, getResumeText, listResumes, deleteResume } from "../services/resumesClient.js";
import { analyzeResume, matchResume } from "../services/scraperAnalysisClient.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

// Upload only stores the file; it stays "pending" until AI or custom summary runs.
export async function create(req: AuthedRequest, res: Response) {
  if (!req.file) {
    res.status(400).json({ error: "file is required" });
    return;
  }

  const created = await createResume(req.userId!, req.file.originalname, req.file.mimetype, req.file.buffer);
  sendUpstream(res, created);
}

// Caches the failure status too, not just a successful analysis, so the resume reflects reality.
export async function summarize(req: AuthedRequest, res: Response) {
  const resumeId = req.params.id as string;

  const textResult = await getResumeText(req.userId!, resumeId);
  if (!textResult.ok) {
    sendUpstream(res, textResult);
    return;
  }
  // callCore leaves data undefined on an empty/non-JSON body even when ok.
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

// User-written alternative to summarize(): stores text directly, no scraper call.
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

// Sends full resume text, not the cached summary: summaries gave inconsistent picks on repeat calls.
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
  // callCore leaves data undefined on an empty/non-JSON body even when ok.
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
      if (!textResult.ok || !textResult.data) {
        return null;
      }
      return { id: r.id, fileName: r.fileName, fullText: textResult.data.extractedText };
    }),
  );

  // Sending a blank candidate would return a verdict computed partly over a resume nobody read.
  const readable = documents.filter(d => d !== null);
  if (readable.length === 0) {
    res.status(502).json({ error: "could not read any of your resumes" });
    return;
  }
  const unreadable = documents.length - readable.length;

  const result = await matchResume(jobDescriptionText, readable);
  if (result.status !== "ok") {
    res.json({ status: result.status });
    return;
  }

  // Own status when the text wasn't a real JD, so the UI reprompts instead of showing "do not apply".
  if (result.data.recommendation === "INSUFFICIENT_JD") {
    res.json({ status: "insufficient_jd" });
    return;
  }

  // The scraper coerces a phantom id to "", so no match here means the model picked nothing.
  const best = analyzed.find(r => r.id === result.data.bestResumeId);
  if (!best) {
    res.status(502).json({ error: "the model did not pick one of your resumes" });
    return;
  }
  res.json({
    status: "ok",
    fileName: best.fileName,
    recommendation: result.data.recommendation,
    reasoning: result.data.reasoning,
    // Tell the caller the verdict was reached over a subset, rather than staying silent about it.
    ...(unreadable > 0 ? { skippedResumes: unreadable } : {}),
  });
}
