import { useDroppable } from "@dnd-kit/core";
import type { JobSummary } from "../../api/jobsApi";
import JobCard from "./JobCard";

export interface SubmittedTrayProps {
  jobs: JobSummary[];
  // Null while the jobs are still loading, so an empty tray isn't read as "nothing here".
  count: number | null;
  open: boolean;
  onToggle: () => void;
  onOpenJob: (job: JobSummary) => void;
}

const countClass = "rounded-full bg-neutral-200 px-2 text-xs font-medium dark:bg-neutral-700";

// Applications waiting on a reply sit beside the board, not on it, so they don't crowd the jobs in play.
// Closed it still takes drops, so a card goes back to Submitted without opening it first.
export default function SubmittedTray({ jobs, count, open, onToggle, onOpenJob }: SubmittedTrayProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "SUBMITTED" });
  const over = isOver ? "ring-2 ring-blue-400" : "";

  if (!open) {
    return (
      <button
        ref={setNodeRef}
        type="button"
        onClick={onToggle}
        aria-expanded={false}
        aria-label={`Show Submitted, ${count ?? "loading"}`}
        className={`flex w-10 shrink-0 flex-col items-center gap-2 rounded-lg border border-dashed border-neutral-300 py-3 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 ${over}`}
      >
        <span className="[writing-mode:vertical-rl] rotate-180">Submitted</span>
        <span className={countClass}>{count ?? "…"}</span>
      </button>
    );
  }

  return (
    <section
      ref={setNodeRef}
      aria-label="Submitted"
      className={`flex min-h-0 w-64 shrink-0 flex-col rounded-lg border border-dashed border-neutral-300 p-2 dark:border-neutral-700 ${over}`}
    >
      <h2 className="mb-2 flex items-center justify-between px-1 text-sm font-semibold text-neutral-700 dark:text-neutral-200">
        <button type="button" onClick={onToggle} aria-expanded className="hover:underline">
          ‹ Submitted
        </button>
        <span className={countClass}>{count ?? "…"}</span>
      </h2>
      <p className="mb-2 px-1 text-xs text-neutral-500 dark:text-neutral-400">Drag one onto the board when they reply.</p>
      <div className="flex min-h-24 flex-1 flex-col gap-2 overflow-y-auto">
        {jobs.map(job => <JobCard key={job.id} job={job} onOpen={onOpenJob} />)}
      </div>
    </section>
  );
}
