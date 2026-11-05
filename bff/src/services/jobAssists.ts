import { saveJobAi } from "./aiResultsClient.js";
import { pickResume, roundTypeWords, runAndSave, type AssistOutcome } from "./aiAssists.js";
import { listInterviews, type InterviewType } from "./interviewsClient.js";
import { getJob, getJobDetail } from "./jobsClient.js";
import { listOffers, offeredRoles } from "./offersClient.js";
import { dataOrError, isServiceError, serviceError } from "./outcome.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// A note to the recruiter after the last round held, using its debrief when there is one.
export async function draftFollowUp(userId: string, jobId: string): Promise<AssistOutcome> {
  const rounds = dataOrError(await listInterviews(userId));
  if (isServiceError(rounds)) return rounds;
  const now = Date.now();
  const held = rounds
    .filter(round => String(round.jobId) === jobId && Date.parse(round.interviewDateTime) <= now)
    .sort((a, b) => b.interviewDateTime.localeCompare(a.interviewDateTime));
  const last = held[0];
  if (!last) {
    return serviceError(409, "there's nothing to follow up on until an interview round has happened");
  }

  const debriefSummary = last.aiResults?.debrief?.content.summary;
  return runAndSave("follow-up", {
    company: last.company,
    role: last.role,
    lastRound: { type: roundTypeWords(last.interviewType), date: last.interviewDateTime.slice(0, 10) },
    daysSinceLastRound: Math.floor((now - Date.parse(last.interviewDateTime)) / DAY_MS),
    interviewers: last.interviewers.map(interviewer => interviewer.name),
    debriefSummary: typeof debriefSummary === "string" ? debriefSummary : "",
  }, content => saveJobAi(userId, jobId, "follow-up", content));
}

// A counter-offer grounded in what the app already holds: the market check and any competing offers.
export async function draftNegotiation(userId: string, jobId: string): Promise<AssistOutcome> {
  const offers = dataOrError(await listOffers(userId));
  if (isServiceError(offers)) return offers;
  const offer = offers.find(candidate => String(candidate.jobId) === jobId);
  if (!offer) {
    return serviceError(404, "no offer for this job");
  }

  const check = offer.marketCheck && !offer.marketCheckStale ? offer.marketCheck : null;
  return runAndSave("negotiation", {
    company: offer.company,
    ...offeredRoles(offer),
    offer: {
      baseSalary: offer.baseSalary,
      annualBonus: offer.annualBonus,
      equityPerYear: offer.equityPerYear,
      equityByYear: offer.equityByYear,
      signOnByYear: offer.signOnPaidByYear,
      averagePerYear: offer.averagePerYear,
      averagedOverYears: offer.averagedOverYears,
      compByYear: offer.compByYear,
      priceGrowthPercent: offer.priceGrowthPercent,
      projectedCompByYear: offer.projectedCompByYear,
      decisionDeadline: offer.decisionDeadline,
      notes: offer.notes ?? "",
    },
    marketCheck: check && {
      verdict: check.verdict, typicalLow: check.typicalLow, typicalHigh: check.typicalHigh, summary: check.summary,
    },
    otherOffers: offers
      .filter(other => other.jobId !== offer.jobId && other.outcome === "ACTIVE")
      .map(other => ({
        company: other.company,
        role: offeredRoles(other).role,
        baseSalary: other.baseSalary,
        annualBonus: other.annualBonus,
        equityPerYear: other.equityPerYear,
        averagePerYear: other.averagePerYear,
        averagedOverYears: other.averagedOverYears,
      })),
  }, content => saveJobAi(userId, jobId, "negotiation", content));
}

// Prep for one kind of round at this job, fitted to the role's field. Possible before any round is
// scheduled; when one of this type is, its time and interviewers ground it. What the recruiter said is
// kept with the answer, so it can be corrected and run again.
export async function prepareForInterview(
  userId: string, jobId: string, interviewType: InterviewType, recruiterNotes: string,
): Promise<AssistOutcome> {
  const job = dataOrError(await getJob(userId, jobId));
  if (isServiceError(job)) return job;
  const detail = dataOrError(await getJobDetail(userId, jobId));
  if (isServiceError(detail)) return detail;
  const rounds = dataOrError(await listInterviews(userId));
  if (isServiceError(rounds)) return rounds;
  const resume = await pickResume(userId, { fileName: detail.recommendedResume });
  if (isServiceError(resume)) return resume;

  const now = Date.now();
  const ofJob = rounds
    .filter(round => String(round.jobId) === jobId)
    .sort((a, b) => a.interviewDateTime.localeCompare(b.interviewDateTime));
  const next = ofJob.find(round => round.interviewType === interviewType && Date.parse(round.interviewDateTime) > now);
  return runAndSave("interview-prep", {
    company: job.company,
    role: job.role,
    roundType: roundTypeWords(interviewType),
    scheduledFor: next?.interviewDateTime ?? "",
    interviewers: next?.interviewers.map(interviewer => interviewer.name) ?? [],
    earlierRounds: ofJob
      .filter(round => Date.parse(round.interviewDateTime) <= now)
      .map(round => roundTypeWords(round.interviewType)),
    jobDescription: detail.jdText,
    resume: resume?.text ?? "",
    recruiterNotes,
  }, content => saveJobAi(userId, jobId, "prep", content, interviewType), {
    interviewType, recruiterNotes, resumeFileName: resume?.fileName ?? null,
  });
}

// Bullet changes for one resume against this job's description. The resume used is kept with the answer.
export async function tailorResume(userId: string, jobId: string, resumeId?: string): Promise<AssistOutcome> {
  const job = dataOrError(await getJob(userId, jobId));
  if (isServiceError(job)) return job;
  const detail = dataOrError(await getJobDetail(userId, jobId));
  if (isServiceError(detail)) return detail;
  if (!detail.jdText.trim()) {
    return serviceError(409, "add the job description first; tailoring compares the resume with it");
  }
  const resume = await pickResume(userId, { resumeId, fileName: detail.recommendedResume });
  if (isServiceError(resume)) return resume;
  if (!resume) {
    return serviceError(409, "upload a resume on the Resumes page first");
  }

  return runAndSave("tailor-resume", {
    company: job.company,
    role: job.role,
    jobDescription: detail.jdText,
    resumeText: resume.text,
  }, content => saveJobAi(userId, jobId, "tailoring", content), { resumeId: resume.id, resumeFileName: resume.fileName });
}
