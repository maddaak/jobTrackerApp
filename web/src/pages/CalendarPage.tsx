import { useEffect, useRef, useState } from "react";
import CalendarGrid from "../components/CalendarGrid";
import InterviewFormModal, { type InterviewFormMode } from "../components/InterviewFormModal";
import { listInterviews, type Interview } from "../api/interviewsApi";
import { downloadIcs } from "../calendarFile";
import { useJobsContext } from "../hooks/useJobsContext";

export default function CalendarPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [formMode, setFormMode] = useState<InterviewFormMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { refresh: refreshJobs } = useJobsContext();
  // Tag each refresh so a slower earlier load can't overwrite newer data.
  const reqId = useRef(0);

  useEffect(() => {
    // Ignore a load that resolves after unmount.
    let ignore = false;
    listInterviews()
      .then(loaded => { if (!ignore) setInterviews(loaded); })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load interviews"); });
    return () => { ignore = true; };
  }, []);

  async function refresh() {
    const id = ++reqId.current;
    try {
      const loaded = await listInterviews();
      if (id === reqId.current) setInterviews(loaded);
    } catch (err) {
      if (id === reqId.current) setError(err instanceof Error ? err.message : "failed to load interviews");
    }
  }

  // A new round can move its job forward, so the shared list must refresh too, or the next action
  // elsewhere PATCHes the job back from a stale copy.
  function handleSaved() {
    setFormMode(null);
    refresh();
    refreshJobs();
  }

  function handleDeleted() {
    setFormMode(null);
    refresh();
    refreshJobs();
  }

  const upcoming = interviews.filter(round =>
    new Date(round.interviewEndDateTime ?? round.interviewDateTime).getTime() > Date.now());

  function goToPrevMonth() {
    setMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function goToNextMonth() {
    setMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  return (
    <div className="min-w-0 p-6">
      <div className="mb-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
        <h1 className="text-2xl font-semibold">Interview Schedule</h1>
        <button
          type="button"
          disabled={upcoming.length === 0}
          title="Download a file your calendar app opens, with every round still to come"
          onClick={() => downloadIcs("upcoming-interviews.ics", upcoming)}
          className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Add upcoming rounds to my calendar
        </button>
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="mb-4 flex items-center justify-between">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          ‹ Prev
        </button>
        <h2 className="text-lg font-medium">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <button
          type="button"
          onClick={goToNextMonth}
          className="rounded border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Next ›
        </button>
      </div>

      <CalendarGrid
        interviews={interviews}
        month={month}
        onSelectDay={date => setFormMode({ kind: "create", date })}
        onSelectInterview={interview => setFormMode({ kind: "edit", interview })}
      />

      <InterviewFormModal
        mode={formMode}
        onClose={() => setFormMode(null)}
        onSaved={handleSaved}
        onDeleted={handleDeleted}
      />
    </div>
  );
}
