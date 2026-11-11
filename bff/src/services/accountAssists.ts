import { getAccountAi, saveAccountAi, type AccountAiKind, type AiResultData } from "./aiResultsClient.js";
import { runAndSave, roundTypeWords, type AssistOutcome } from "./aiAssists.js";
import type { InterviewType } from "./interviewsClient.js";
import { getJobDetail, listJobs, type Outcome } from "./jobsClient.js";
import { getMetrics } from "./metricsClient.js";
import { seasonShown } from "./seasonsClient.js";
import { dataOrError, isServiceError, serviceError, type ServiceError } from "./outcome.js";
// Enough reasons to show a pattern without one long search filling the prompt.
const MAX_REJECTION_REASONS = 40;
const MAX_REASON_CHARS = 300;

const CLOSED: Outcome[] = ["REJECTED", "GHOSTED", "WITHDRAWN", "POSITION_CLOSED"];
const OFFERED: Outcome[] = ["OFFER_ACCEPTED", "OFFER_DECLINED"];

// Null when nothing has been saved yet, which isn't an error to the page.
export async function savedAccountResult(
  userId: string, kind: AccountAiKind, company?: string,
): Promise<{ result: AiResultData | null } | ServiceError> {
  const saved = await getAccountAi(userId, kind, company);
  if (saved.status === 404) return { result: null };
  const result = dataOrError(saved);
  return isServiceError(result) ? result : { result };
}

// Kept per company, so a second job there reuses the brief rather than paying for another.
export async function briefCompany(userId: string, company: string, role: string): Promise<AssistOutcome> {
  return runAndSave("company-brief", { company, role },
    content => saveAccountAi(userId, "company-brief", content, { company }), { company });
}

// Counts and rejection reasons, never company names: the patterns are about how the search goes, not where.
export async function findPatterns(userId: string): Promise<AssistOutcome> {
  const season = await seasonShown(userId);
  if (isServiceError(season)) return season;
  const jobs = dataOrError(await listJobs(userId));
  if (isServiceError(jobs)) return jobs;
  if (jobs.length === 0) {
    return serviceError(409, "add some jobs first; patterns come from your applications");
  }
  const metrics = dataOrError(await getMetrics(userId));
  if (isServiceError(metrics)) return metrics;

  const bySource: Record<string, { applied: number; reachedInterview: number; offers: number }> = {};
  const stoppedAfter: Record<string, Record<string, number>> = {};
  for (const job of jobs) {
    const source = (bySource[job.sourceCategory] ??= { applied: 0, reachedInterview: 0, offers: 0 });
    source.applied++;
    if (job.latestInterview) source.reachedInterview++;
    if (OFFERED.includes(job.outcome) || job.currentStage === "OFFER_STAGE") source.offers++;
    if (CLOSED.includes(job.outcome)) {
      const last = job.latestInterview ? `after a ${roundTypeWords(job.latestInterview.interviewType)} round` : "before any interview";
      const byLast = (stoppedAfter[job.outcome] ??= {});
      byLast[last] = (byLast[last] ?? 0) + 1;
    }
  }

  const rejected = jobs.filter(job => job.outcome === "REJECTED").slice(0, MAX_REJECTION_REASONS);
  const details = await Promise.all(rejected.map(job => getJobDetail(userId, String(job.id))));
  const rejectionReasons = details
    .map(detail => detail.data?.rejectedReason?.trim().slice(0, MAX_REASON_CHARS))
    .filter((reason): reason is string => !!reason);

  return runAndSave("insights", {
    stats: {
      totalApplications: jobs.length,
      furthestStageReached: metrics.funnel,
      outcomes: metrics.outcomeCounts,
      roundsByType: metrics.interviewRoundCounts.map(row => ({
        round: roundTypeWords(row.roundNode as InterviewType | "PANEL"),
        held: row.count, passed: row.passed, notPassed: row.notPassed,
      })),
      byHowApplied: bySource,
      closedApplicationsStopped: stoppedAfter,
      rejectionReasons,
    },
  }, content => saveAccountAi(userId, "insights", content, { season }), { jobCount: jobs.length });
}
