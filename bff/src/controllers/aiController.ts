import type { Response } from "express";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendOutcome, sendUpstream } from "../middleware/upstreamResponse.js";
import { RESUME_ID } from "../middleware/validateRouteId.js";
import {
  clearAccountAi, clearJobAi, clearRoundAi, JOB_AI_KINDS, ROUND_AI_KINDS, type JobAiKind, type RoundAiKind,
} from "../services/aiResultsClient.js";
import { briefCompany, findPatterns, savedAccountResult } from "../services/accountAssists.js";
import { INTERVIEW_TYPES, type InterviewType } from "../services/interviewsClient.js";
import { draftFollowUp, draftNegotiation, prepareForInterview, tailorResume } from "../services/jobAssists.js";
import { debriefRound } from "../services/roundAssists.js";

const MAX_NOTES_CHARS = 10_000;
const MAX_NAME_CHARS = 200;

function text(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() !== "" && value.length <= max ? value.trim() : null;
}

export async function getCompanyBrief(req: AuthedRequest, res: Response) {
  const company = text(req.query.company, MAX_NAME_CHARS);
  if (!company) {
    res.status(400).json({ error: "say which company" });
    return;
  }
  sendOutcome(res, await savedAccountResult(req.userId!, "company-brief", company));
}

export async function runCompanyBrief(req: AuthedRequest, res: Response) {
  const company = text(req.body?.company, MAX_NAME_CHARS);
  const role = req.body?.role === undefined ? "" : text(req.body.role, MAX_NAME_CHARS);
  if (!company || role === null) {
    res.status(400).json({ error: `company is required, and company and role must be at most ${MAX_NAME_CHARS} characters` });
    return;
  }
  sendOutcome(res, await briefCompany(req.userId!, company, role));
}

export async function removeCompanyBrief(req: AuthedRequest, res: Response) {
  const company = text(req.query.company, MAX_NAME_CHARS);
  if (!company) {
    res.status(400).json({ error: "say which company" });
    return;
  }
  sendUpstream(res, await clearAccountAi(req.userId!, "company-brief", company));
}

export async function getInsights(req: AuthedRequest, res: Response) {
  sendOutcome(res, await savedAccountResult(req.userId!, "insights"));
}

export async function runInsights(req: AuthedRequest, res: Response) {
  sendOutcome(res, await findPatterns(req.userId!));
}

export async function removeInsights(req: AuthedRequest, res: Response) {
  sendUpstream(res, await clearAccountAi(req.userId!, "insights"));
}

export async function runFollowUp(req: AuthedRequest, res: Response) {
  sendOutcome(res, await draftFollowUp(req.userId!, req.params.id as string));
}

export async function runNegotiation(req: AuthedRequest, res: Response) {
  sendOutcome(res, await draftNegotiation(req.userId!, req.params.id as string));
}

export async function runTailoring(req: AuthedRequest, res: Response) {
  const resumeId = req.body?.resumeId;
  if (resumeId !== undefined && (typeof resumeId !== "string" || !RESUME_ID.test(resumeId))) {
    res.status(400).json({ error: "invalid resume id" });
    return;
  }
  sendOutcome(res, await tailorResume(req.userId!, req.params.id as string, resumeId));
}

function interviewType(value: unknown): InterviewType | null {
  return INTERVIEW_TYPES.find(type => type === value) ?? null;
}

export async function removeJobResult(req: AuthedRequest, res: Response) {
  const kind = req.params.kind as JobAiKind;
  if (!JOB_AI_KINDS.includes(kind)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  const type = kind === "prep" ? interviewType(req.query.interviewType) : undefined;
  if (type === null) {
    res.status(400).json({ error: "say which kind of interview" });
    return;
  }
  sendUpstream(res, await clearJobAi(req.userId!, req.params.id as string, kind, type));
}

export async function runPrep(req: AuthedRequest, res: Response) {
  const type = interviewType(req.body?.interviewType);
  if (!type) {
    res.status(400).json({ error: "say which kind of interview to prepare for" });
    return;
  }
  const given = req.body?.recruiterNotes;
  const recruiterNotes = given === undefined || (typeof given === "string" && given.trim() === "") ? "" : text(given, MAX_NOTES_CHARS);
  if (recruiterNotes === null) {
    res.status(400).json({ error: `the recruiter's notes must be text of at most ${MAX_NOTES_CHARS} characters` });
    return;
  }
  sendOutcome(res, await prepareForInterview(req.userId!, req.params.id as string, type, recruiterNotes));
}

export async function runDebrief(req: AuthedRequest, res: Response) {
  const notes = text(req.body?.notes, MAX_NOTES_CHARS);
  if (!notes) {
    res.status(400).json({ error: `notes are required, at most ${MAX_NOTES_CHARS} characters` });
    return;
  }
  sendOutcome(res, await debriefRound(req.userId!, req.params.roundId as string, notes));
}

export async function removeRoundResult(req: AuthedRequest, res: Response) {
  const kind = req.params.kind as RoundAiKind;
  if (!ROUND_AI_KINDS.includes(kind)) {
    res.status(404).json({ error: "not found" });
    return;
  }
  sendUpstream(res, await clearRoundAi(req.userId!, req.params.roundId as string, kind));
}
