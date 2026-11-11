import { getResumeText, listResumes } from "./resumesClient.js";
import { matchResume } from "./scraperAnalysisClient.js";
import { dataOrError, isServiceError, serviceError, type ServiceError } from "./outcome.js";

export type MatchOutcome =
  | {
    status: "ok";
    fileName: string;
    recommendation: "APPLY" | "DO_NOT_APPLY";
    // As the posting names them, for the form to fill in if still empty.
    company: string;
    role: string;
    strengths: string[];
    gaps: string[];
    // Present only when some resumes couldn't be read, so a partial verdict says so.
    skippedResumes?: number;
  }
  | { status: "no_resumes" | "insufficient_jd" | "not_configured" | "unavailable" }
  | ServiceError;

// Which of the caller's resumes fits a job, and whether to apply. Sends full resume text, not the
// cached summary: summaries gave inconsistent picks on repeat calls.
export async function matchJobToResumes(userId: string, jobDescriptionText: string): Promise<MatchOutcome> {
  const resumes = dataOrError(await listResumes(userId));
  if (isServiceError(resumes)) return resumes;
  const analyzed = resumes.filter(r => r.analysisStatus === "ok" && r.summary);
  if (analyzed.length === 0) {
    return { status: "no_resumes" };
  }

  const documents = await Promise.all(
    analyzed.map(async r => {
      const textResult = await getResumeText(userId, r.id);
      return textResult.ok && textResult.data
        ? { id: r.id, fileName: r.fileName, fullText: textResult.data.extractedText }
        : null;
    }),
  );
  // Sending a blank candidate would return a verdict computed partly over a resume nobody read.
  const readable = documents.filter(d => d !== null);
  if (readable.length === 0) {
    return serviceError(502, "could not read any of your resumes");
  }

  const result = await matchResume(jobDescriptionText, readable);
  if (result.status === "rejected") {
    return serviceError(result.httpStatus, result.error);
  }
  if (result.status !== "ok") {
    return { status: result.status };
  }
  // Its own status when the text wasn't a real JD, so the UI reprompts instead of showing "do not apply".
  if (result.data.recommendation === "INSUFFICIENT_JD") {
    return { status: "insufficient_jd" };
  }
  // The scraper coerces a phantom id to "", so no match here means the model picked nothing.
  const best = analyzed.find(r => r.id === result.data.bestResumeId);
  if (!best) {
    return serviceError(502, "the model did not pick one of your resumes");
  }
  const skipped = documents.length - readable.length;
  return {
    status: "ok",
    fileName: best.fileName,
    recommendation: result.data.recommendation,
    company: result.data.company,
    role: result.data.role,
    strengths: result.data.strengths,
    gaps: result.data.gaps,
    ...(skipped > 0 ? { skippedResumes: skipped } : {}),
  };
}
