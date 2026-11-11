import { useDraggable } from "@dnd-kit/core";
import { INTERVIEW_TYPE_LABELS } from "../../api/interviewsApi";
import type { JobSummary } from "../../api/jobsApi";
import { formatWeekdayDateTimeRange } from "../../interviewTimes";

export interface JobCardProps {
  job: JobSummary;
  onOpen: (job: JobSummary) => void;
}

function latestRoundLine(job: JobSummary): string | null {
  const round = job.latestInterview;
  if (!round) return null;
  const type = round.interviewType ? INTERVIEW_TYPE_LABELS[round.interviewType] : "Interview";
  if (new Date(round.interviewDateTime).getTime() > Date.now()) {
    return `${type} · ${formatWeekdayDateTimeRange(round.interviewDateTime, round.interviewEndDateTime)}`;
  }
  const done = new Date(round.interviewDateTime).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${type} · done ${done}`;
}

const cardClass =
  "rounded-md border border-neutral-200 bg-white p-3 text-left shadow-sm dark:border-neutral-700 dark:bg-neutral-900";

// What a card shows, drawn both in its column and in the overlay that follows the pointer during a drag.
export function JobCardContent({ job }: { job: JobSummary }) {
  const roundLine = latestRoundLine(job);
  const roundCount = job.latestInterview?.roundCount ?? 0;

  return (
    <>
      <p className="truncate font-medium" title={job.company}>{job.company}</p>
      <p className="truncate text-sm text-neutral-600 dark:text-neutral-300" title={job.role}>{job.role}</p>
      {roundLine && (
        <p className="mt-2 truncate text-xs text-neutral-500 dark:text-neutral-400" title={roundLine}>{roundLine}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {job.currentStage === "WAITING_INTERVIEW_RESULTS" && (
          <span className="rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            Waiting on results
          </span>
        )}
        {job.needsScheduling && (
          <span className="rounded bg-sky-100 px-1.5 py-0.5 font-medium text-sky-800 dark:bg-sky-900/40 dark:text-sky-200">
            Schedule round
          </span>
        )}
        {roundCount > 0 && (
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {roundCount} {roundCount === 1 ? "round" : "rounds"}
          </span>
        )}
      </div>
    </>
  );
}

export function DraggingJobCard({ job }: { job: JobSummary }) {
  return (
    <div className={`${cardClass} cursor-grabbing shadow-lg ring-2 ring-blue-400`}>
      <JobCardContent job={job} />
    </div>
  );
}

export default function JobCard({ job, onOpen }: JobCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: job.id });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      // The sensor's drag threshold lets a plain click through, so the card opens on click and moves on drag.
      onClick={() => onOpen(job)}
      // Space is the keyboard sensor's drag key, so Enter is what opens the card, but not mid-move.
      onKeyDown={e => {
        listeners?.onKeyDown?.(e);
        if (e.key === "Enter" && !isDragging) onOpen(job);
      }}
      // The overlay is what moves; this stays behind as a faded placeholder of where the card came from.
      // The pointer, not the grab hand: a click is the usual action, and a drag shows the grabbing hand.
      className={`${cardClass} cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 ${isDragging ? "opacity-40" : ""}`}
    >
      <JobCardContent job={job} />
    </div>
  );
}
