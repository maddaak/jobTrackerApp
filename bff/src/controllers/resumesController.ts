import type { Response } from "express";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { createResume, applyResumeAnalysis, listResumes, deleteResume } from "../services/resumesClient.js";
import { analyzeResume, matchResume } from "../services/scraperAnalysisClient.js";

// Upload is a 3-hop dance: core extracts+stores the file immediately (never lost even if
// analysis fails), then the scraper's Claude call analyzes the extracted text, then core
// caches whatever happened — a real analysis on success, or just the failure status
// (not_configured / unavailable) otherwise — so the stored resume always reflects reality.
export async function create(req: AuthedRequest, res: Response) {
  if (!req.file) {
    res.status(400).json({ error: "file is required" });
    return;
  }

  const created = await createResume(req.userId!, req.file.originalname, req.file.mimetype, req.file.buffer);
  if (!created.ok) {
    res.status(created.status).json(created.data);
    return;
  }

  const analysis = await analyzeResume(created.data.extractedText);
  const patched = await applyResumeAnalysis(
    req.userId!,
    created.data.id,
    analysis.status === "ok" ? JSON.stringify(analysis.data) : null,
    analysis.status,
  );

  res.status(patched.status).json(patched.data);
}

export async function list(req: AuthedRequest, res: Response) {
  const result = await listResumes(req.userId!);
  res.status(result.status).json(result.data);
}

export async function remove(req: AuthedRequest, res: Response) {
  const resumeId = req.params.id as string;
  const result = await deleteResume(req.userId!, resumeId);
  res.status(result.status).json(result.data);
}

export async function match(req: AuthedRequest, res: Response) {
  const jobDescriptionText = (req.body ?? {}).jobDescriptionText as string | undefined;
  if (!jobDescriptionText || !jobDescriptionText.trim()) {
    res.status(400).json({ error: "jobDescriptionText is required" });
    return;
  }

  const resumesResult = await listResumes(req.userId!);
  if (!resumesResult.ok) {
    res.status(resumesResult.status).json(resumesResult.data);
    return;
  }
  const analyzed = resumesResult.data.filter(r => r.analysisStatus === "ok" && r.summary);
  if (analyzed.length === 0) {
    res.json({ status: "no_resumes" });
    return;
  }

  const matchInputs = analyzed.map(r => ({
    id: r.id,
    fileName: r.fileName,
    summary: r.summary!,
    skills: r.skills ?? [],
    seniority: r.seniority ?? "",
    roles: r.roles ?? [],
  }));

  const result = await matchResume(jobDescriptionText, matchInputs);
  if (result.status !== "ok") {
    res.json({ status: result.status });
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
