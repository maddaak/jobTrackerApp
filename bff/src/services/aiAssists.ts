import type { AiResultData } from "./aiResultsClient.js";
import type { InterviewType } from "./interviewsClient.js";
import { getResumeText, listResumes } from "./resumesClient.js";
import { runAssist, type AssistName } from "./scraperAnalysisClient.js";
import { dataOrError, isServiceError, serviceError, type ServiceError } from "./outcome.js";
import type { UpstreamResult } from "./upstream.js";

export type AssistOutcome =
  | { status: "ok"; result: AiResultData }
  | { status: "not_configured" | "unavailable" }
  | ServiceError;

// Every button runs its assist and saves the answer, so seeing it again never pays for it again. kept is
// stored alongside the answer: what it was made from, which the page shows with it.
export async function runAndSave(
  name: AssistName,
  input: Record<string, unknown>,
  save: (content: Record<string, unknown>) => Promise<UpstreamResult<AiResultData>>,
  kept: Record<string, unknown> = {},
): Promise<AssistOutcome> {
  const answer = await runAssist(name, input);
  if (answer.status === "rejected") return serviceError(answer.httpStatus, answer.error);
  if (answer.status !== "ok") return { status: answer.status };
  const saved = dataOrError(await save({ ...answer.data, ...kept }));
  if (isServiceError(saved)) return saved;
  return { status: "ok", result: saved };
}

// Words the model reads better than the enum: SYSTEM_DESIGN is "system design", and the Sankey's PANEL "panel".
export function roundTypeWords(type: InterviewType | "PANEL" | null): string {
  return type ? type.toLowerCase().replaceAll("_", " ") : "interview";
}

export interface PickedResume {
  id: string;
  fileName: string;
  text: string;
}

// The resume asked for, else the one recommended when the job was added, else the newest. Null when the
// account has none it can read, which a caller either works without or refuses. A resume picked by hand that
// can't be read is an error, not "you have none".
export async function pickResume(
  userId: string,
  choice: { resumeId?: string; fileName?: string | null },
): Promise<PickedResume | null | ServiceError> {
  const resumes = dataOrError(await listResumes(userId));
  if (isServiceError(resumes)) return resumes;
  const newestFirst = [...resumes].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  const resume = choice.resumeId
    ? resumes.find(candidate => candidate.id === choice.resumeId)
    : newestFirst.find(candidate => candidate.fileName === choice.fileName) ?? newestFirst[0];
  if (!resume) {
    return choice.resumeId ? serviceError(404, "resume not found") : null;
  }
  const text = dataOrError(await getResumeText(userId, resume.id));
  if (isServiceError(text)) return text;
  if (!text.extractedText.trim()) return choice.resumeId ? serviceError(422, "that resume has no readable text") : null;
  return { id: resume.id, fileName: resume.fileName, text: text.extractedText };
}
