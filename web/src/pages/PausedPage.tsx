import { useState } from "react";
import { INTERVIEW_TYPE_LABELS } from "../api/interviewsApi";
import { toUpdateJobInput, updateJob, type JobSummary } from "../api/jobsApi";
import JobDetailModal from "../components/JobDetailModal";
import { PIPELINE_PLACES, isPaused, pipelinePlaceOf } from "../jobPlacement";
import { useJobs } from "../hooks/useJobs";

function placeLabel(job: JobSummary): string {
  return PIPELINE_PLACES.find(place => place.id === pipelinePlaceOf(job))?.label ?? "the board";
}

function lastRound(job: JobSummary): string | null {
  const round = job.latestInterview;
  if (!round) return null;
  const type = round.interviewType ? INTERVIEW_TYPE_LABELS[round.interviewType] : "Interview";
  const date = new Date(round.interviewDateTime).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `Last round: ${type}, ${date}`;
}

// Frozen or on hold, not over: kept off the board, and resumed straight back to where they stood.
export default function PausedPage() {
  const { jobs, loaded, error, setError, refresh } = useJobs();
  const [openJobId, setOpenJobId] = useState<number | null>(null);
  const [resumingId, setResumingId] = useState<number | null>(null);

  const paused = jobs.filter(isPaused);
  const openJob = jobs.find(job => job.id === openJobId) ?? null;

  async function resume(job: JobSummary) {
    setResumingId(job.id);
    setError(null);
    try {
      await updateJob(job.id, { ...toUpdateJobInput(job), outcome: "ACTIVE" });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to resume job");
    } finally {
      setResumingId(null);
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold">Paused</h1>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        Hiring freezes and holds. Resuming puts a job back exactly where it was.
      </p>
      {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!loaded ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
      ) : paused.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          Nothing paused. Pause a job from its card when a role freezes.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {paused.map(job => (
            <li key={job.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium" title={job.company}>{job.company}</p>
                <p className="truncate text-sm text-neutral-600 dark:text-neutral-300" title={job.role}>{job.role}</p>
              </div>
              <p className="w-64 truncate text-sm text-neutral-500 dark:text-neutral-400" title={lastRound(job) ?? undefined}>
                {lastRound(job) ?? "No interviews yet"}
              </p>
              <p className="w-40 text-sm text-neutral-500 dark:text-neutral-400">Resumes in {placeLabel(job)}</p>
              <div className="flex gap-4">
                <button
                  type="button"
                  disabled={resumingId === job.id}
                  onClick={() => resume(job)}
                  className="text-sm text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400"
                >
                  Resume
                </button>
                <button
                  type="button"
                  onClick={() => setOpenJobId(job.id)}
                  className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                >
                  Details
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <JobDetailModal job={openJob} allJobs={jobs} onClose={() => setOpenJobId(null)} onSaved={refresh} />
    </div>
  );
}
