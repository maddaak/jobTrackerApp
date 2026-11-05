import { useState } from "react";
import { INTERVIEW_TYPE_LABELS } from "../api/interviewsApi";
import { CLOSED_OUTCOMES, OUTCOME_LABELS, type JobSummary, type Outcome } from "../api/jobsApi";
import JobDetailModal from "../components/JobDetailModal";
import { isClosed } from "../jobPlacement";
import { useJobs } from "../hooks/useJobs";

const OUTCOME_BADGE: Record<string, string> = {
  REJECTED: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  GHOSTED: "bg-stone-200 text-stone-800 dark:bg-stone-700 dark:text-stone-100",
  WITHDRAWN: "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100",
  POSITION_CLOSED: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
};

// How far it got, read from the last round, since a closed job's stage is always Finalized.
function lastRound(job: JobSummary): string {
  const round = job.latestInterview;
  if (!round) return "No interviews";
  const type = round.interviewType ? INTERVIEW_TYPE_LABELS[round.interviewType] : "Interview";
  return `${round.roundCount} ${round.roundCount === 1 ? "round" : "rounds"}, last: ${type}`;
}

export default function ClosedPage() {
  const { jobs, loaded, error, refresh } = useJobs();
  const [filter, setFilter] = useState<Outcome | "ALL">("ALL");
  const [openJobId, setOpenJobId] = useState<number | null>(null);

  const closed = jobs.filter(isClosed);
  const shown = filter === "ALL" ? closed : closed.filter(job => job.outcome === filter);
  const openJob = jobs.find(job => job.id === openJobId) ?? null;

  const tabs: { id: Outcome | "ALL"; label: string; count: number }[] = [
    { id: "ALL", label: "All", count: closed.length },
    ...CLOSED_OUTCOMES.map(outcome => ({
      id: outcome,
      label: OUTCOME_LABELS[outcome],
      count: closed.filter(job => job.outcome === outcome).length,
    })),
  ];

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Closed</h1>
      {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {/* Filters over one list, not tabs: there are no panels to switch between. */}
      <div role="group" aria-label="Outcome" className="mb-4 flex flex-wrap gap-1">
        {tabs.map(tab => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={filter === tab.id}
            onClick={() => setFilter(tab.id)}
            className={[
              "rounded px-3 py-1.5 text-sm font-medium",
              filter === tab.id ? "bg-blue-600 text-white" : "hover:bg-neutral-100 dark:hover:bg-neutral-800",
            ].join(" ")}
          >
            {tab.label} <span className="tabular-nums opacity-75">{tab.count}</span>
          </button>
        ))}
      </div>

      {!loaded ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No closed jobs here.</p>
      ) : (
        <ul className="divide-y divide-neutral-200 rounded-lg border border-neutral-200 dark:divide-neutral-800 dark:border-neutral-800">
          {shown.map(job => (
            <li key={job.id}>
              <button
                type="button"
                onClick={() => setOpenJobId(job.id)}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-left hover:bg-neutral-50 dark:hover:bg-neutral-900"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" title={job.company}>{job.company}</span>
                  <span className="block truncate text-sm text-neutral-600 dark:text-neutral-300" title={job.role}>
                    {job.role}
                  </span>
                </span>
                <span className="w-64 truncate text-sm text-neutral-500 dark:text-neutral-400" title={lastRound(job)}>
                  {lastRound(job)}
                </span>
                <span className={`rounded px-2 py-0.5 text-xs font-medium ${OUTCOME_BADGE[job.outcome]}`}>
                  {OUTCOME_LABELS[job.outcome]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <JobDetailModal job={openJob} allJobs={jobs} onClose={() => setOpenJobId(null)} onSaved={refresh} />
    </div>
  );
}
