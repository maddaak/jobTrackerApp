import { useEffect, useRef, useState } from "react";
import { listUpcomingInterviews, INTERVIEW_TYPE_LABELS, type Interview } from "../api/interviewsApi";
import InterviewFormModal, { type InterviewFormMode } from "./InterviewFormModal";

export interface UpcomingInterviewsBannerProps {
  // Bumped by the parent on any interview change anywhere on the page.
  refreshSignal: number;
  onInterviewChanged: () => void;
}

function formatInterviewDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function UpcomingInterviewsBanner({ refreshSignal, onInterviewChanged }: UpcomingInterviewsBannerProps) {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [modalMode, setModalMode] = useState<InterviewFormMode | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Guard against out-of-order responses and setState after unmount.
    let ignore = false;
    async function refresh() {
      try {
        const data = await listUpcomingInterviews();
        if (ignore) return;
        setLoadError(null);
        const hasNewInterview = data.some(i => !knownIdsRef.current.has(i.roundId));
        knownIdsRef.current = new Set(data.map(i => i.roundId));
        setInterviews(data);
        // Resurface a dismissed banner only when a new interview id appears, not on unrelated saves.
        if (hasNewInterview) setDismissed(false);
      } catch (err) {
        if (ignore) return;
        // Say the load failed rather than silently showing nothing, which reads as "no interviews".
        setLoadError(err instanceof Error ? err.message : "failed to load upcoming interviews");
      }
    }
    refresh();
    return () => {
      ignore = true;
    };
  }, [refreshSignal]);

  function handleSaved() {
    setModalMode(null);
    onInterviewChanged();
  }

  function handleDeleted() {
    setModalMode(null);
    onInterviewChanged();
  }

  // A failed load must not look like "no interviews in the next 72 hours".
  if (loadError && !dismissed) {
    return (
      <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
        Couldn't check for upcoming interviews: {loadError}
      </p>
    );
  }

  if (dismissed || interviews.length === 0) return null;

  return (
    <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">Upcoming interviews:</p>
          <ul className="mt-1 space-y-1">
            {interviews.map(interview => (
              <li key={interview.roundId}>
                <button
                  type="button"
                  onClick={() => setModalMode({ kind: "edit", interview })}
                  className="font-medium text-blue-700 hover:underline dark:text-blue-300"
                >
                  {interview.company}
                </button>
                {" — "}
                {formatInterviewDateTime(interview.interviewDateTime)}
                {interview.interviewType && ` · ${INTERVIEW_TYPE_LABELS[interview.interviewType]}`}
              </li>
            ))}
          </ul>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setDismissed(true)}
          className="text-amber-600 hover:text-amber-900 dark:text-amber-300 dark:hover:text-amber-50"
        >
          ✕
        </button>
      </div>

      <InterviewFormModal mode={modalMode} onClose={() => setModalMode(null)} onSaved={handleSaved} onDeleted={handleDeleted} />
    </div>
  );
}
