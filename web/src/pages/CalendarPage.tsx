import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CalendarGrid from "../components/CalendarGrid";
import InterviewFormModal, { type InterviewFormMode } from "../components/InterviewFormModal";
import { listInterviews, type Interview } from "../api/interviewsApi";

export default function CalendarPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [month, setMonth] = useState(() => new Date());
  const [formMode, setFormMode] = useState<InterviewFormMode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      setInterviews(await listInterviews());
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load interviews");
    }
  }

  function handleSaved() {
    setFormMode(null);
    refresh();
  }

  function handleDeleted() {
    setFormMode(null);
    refresh();
  }

  function goToPrevMonth() {
    setMonth(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  }

  function goToNextMonth() {
    setMonth(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  }

  return (
    <div className="min-w-0 p-6">
      <div className="relative mb-6 flex items-center justify-center">
        <h1 className="text-2xl font-semibold">Interview Schedule</h1>
        <Link to="/" className="absolute left-0 text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Back
        </Link>
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
