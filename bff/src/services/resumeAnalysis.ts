import { applyResumeAnalysis, getResumeText, type ResumeSummaryData } from "./resumesClient.js";
import { analyzeResume } from "./scraperAnalysisClient.js";
import { dataOrError, isServiceError, serviceError, type ServiceError } from "./outcome.js";

export type AnalysisOutcome = ResumeSummaryData | ServiceError;

// Runs the AI summary of one resume and stores whatever came of it, failure included, so the resume
// shows what really happened rather than staying "pending" forever.
export async function summarizeResume(userId: string, resumeId: string): Promise<AnalysisOutcome> {
  const text = dataOrError(await getResumeText(userId, resumeId));
  if (isServiceError(text)) return text;

  const analysis = await analyzeResume(text.extractedText);
  // A refusal (the day's limit, say) ran nothing, so the resume keeps what it had and the reason is shown.
  if (analysis.status === "rejected") return serviceError(analysis.httpStatus, analysis.error);
  return dataOrError(await applyResumeAnalysis(
    userId,
    resumeId,
    analysis.status === "ok" ? JSON.stringify(analysis.data) : null,
    analysis.status,
    analysis.status === "ok" ? "ai" : null,
  ));
}

export async function setCustomSummary(userId: string, resumeId: string, summary: string): Promise<AnalysisOutcome> {
  const analysisJson = JSON.stringify({ summary, skills: [], seniority: null, roles: [] });
  return dataOrError(await applyResumeAnalysis(userId, resumeId, analysisJson, "ok", "custom"));
}
