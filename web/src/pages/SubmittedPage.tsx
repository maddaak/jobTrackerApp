import { useState } from "react";
import { SOURCE_CATEGORY_LABELS, toUpdateJobInput, updateJob, type JobSummary } from "../api/jobsApi";
import CloseJobDialog from "../components/CloseJobDialog";
import JobDetailModal from "../components/JobDetailModal";
import { useJobs } from "../hooks/useJobs";
import { isSubmitted } from "../jobPlacement";
import { safeHref } from "../safeHref";

const DAY_MS = 24 * 60 * 60 * 1000;
// Most employers that want to talk reply within a few weeks; past this an application is likely ghosted.
export const QUIET_AFTER_DAYS = 30;

const actionClass = "text-sm text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400";

// Applications still waiting on a reply, kept off the board so they don't crowd the jobs in play.
export default function SubmittedPage() {
  const { jobs, loaded, error, setError, refresh } = useJobs();
  const [openJobId, setOpenJobId] = useState<number | null>(null);
  const [closingJob, setClosingJob] = useState<JobSummary | null>(null);
  const [movingId, setMovingId] = useState<number | null>(null);

  const submitted = jobs
    .filter(isSubmitted)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const openJob = jobs.find(job => job.id === openJobId) ?? null;
  const daysWaiting = (job: JobSummary) => Math.floor((Date.now() - new Date(job.createdAt).getTime()) / DAY_MS);
  const quiet = submitted.filter(job => daysWaiting(job) >= QUIET_AFTER_DAYS);
  const [markingAll, setMarkingAll] = useState(false);

  async function move(job: JobSummary, change: Partial<ReturnType<typeof toUpdateJobInput>>) {
    setMovingId(job.id);
    setError(null);
    try {
      await updateJob(job.id, { ...toUpdateJobInput(job), ...change });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to update job");
    } finally {
      setMovingId(null);
    }
  }

  // One at a time, so a failure part way says which job it stopped at and the rest stay as they were.
  async function markAllGhosted() {
    if (!window.confirm(`Mark ${quiet.length} ${quiet.length === 1 ? "application" : "applications"} as ghosted? Each moves to Closed, and can be reopened there.`)) return;
    setMarkingAll(true);
    setError(null);
    try {
      for (const job of quiet) {
        try {
          await updateJob(job.id, { ...toUpdateJobInput(job), outcome: "GHOSTED" });
        } catch (err) {
          setError(`${job.company}: ${err instanceof Error ? err.message : "failed to update job"}; stopped there`);
          return;
        }
      }
    } finally {
      await refresh();
      setMarkingAll(false);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Submitted</h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {loaded && `${submitted.length} ${submitted.length === 1 ? "application" : "applications"} waiting on a reply. `}
          When one asks for an interview, mark it to put it on the board.
        </p>
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {quiet.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="flex-1">
            {quiet.length} {quiet.length === 1 ? "application has" : "applications have"} had no reply in{" "}
            {QUIET_AFTER_DAYS} days or more. Marking them ghosted moves them to Closed, so this page holds
            only what might still answer.
          </p>
          <button
            type="button"
            disabled={markingAll}
            onClick={markAllGhosted}
            className="rounded border border-amber-400 px-3 py-1 font-medium hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:hover:bg-amber-900/40"
          >
            {markingAll ? "Marking…" : `Mark ${quiet.length === 1 ? "it" : `all ${quiet.length}`} ghosted`}
          </button>
        </div>
      )}

      {!loaded ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
      ) : submitted.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Nothing waiting on a reply.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {submitted.map(job => {
            const days = daysWaiting(job);
            const postingUrl = safeHref(job.url);
            return (
              <li key={job.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium" title={job.company}>{job.company}</p>
                  {postingUrl ? (
                    <a
                      href={postingUrl}
                      target="_blank"
                      rel="noreferrer"
                      title={job.role}
                      className="block truncate text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                      {job.role} ↗
                    </a>
                  ) : (
                    <p className="truncate text-sm text-neutral-600 dark:text-neutral-300" title={job.role}>{job.role}</p>
                  )}
                </div>
                <p className="w-40 text-sm text-neutral-500 dark:text-neutral-400">
                  {SOURCE_CATEGORY_LABELS[job.sourceCategory]}
                </p>
                <p
                  className={`w-28 text-sm tabular-nums ${days >= QUIET_AFTER_DAYS ? "font-medium text-amber-700 dark:text-amber-300" : "text-neutral-500 dark:text-neutral-400"}`}
                  title={days >= QUIET_AFTER_DAYS ? "No reply in a while; it may be ghosted" : undefined}
                >
                  {days === 0 ? "Today" : `${days} ${days === 1 ? "day" : "days"} ago`}
                </p>
                <div className="flex gap-4">
                  <button
                    type="button"
                    disabled={movingId === job.id}
                    onClick={() => move(job, { currentStage: "INTERVIEW_REQUEST" })}
                    className={actionClass}
                  >
                    Got an interview request
                  </button>
                  {days >= QUIET_AFTER_DAYS && (
                    <button
                      type="button"
                      disabled={movingId === job.id || markingAll}
                      aria-label={`Mark ${job.company} ghosted`}
                      onClick={() => move(job, { outcome: "GHOSTED" })}
                      className={actionClass}
                    >
                      Mark ghosted
                    </button>
                  )}
                  <button type="button" onClick={() => setOpenJobId(job.id)} className={actionClass}>
                    Details
                  </button>
                  <button
                    type="button"
                    onClick={() => setClosingJob(job)}
                    className="text-sm text-red-600 hover:underline dark:text-red-400"
                  >
                    Close
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <JobDetailModal job={openJob} allJobs={jobs} onClose={() => setOpenJobId(null)} onSaved={refresh} />
      <CloseJobDialog
        job={closingJob}
        onClose={() => setClosingJob(null)}
        onClosed={warning => { setClosingJob(null); setError(warning ?? null); refresh(); }}
      />
    </div>
  );
}
