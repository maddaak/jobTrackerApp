import { useEffect, useRef, useState } from "react";
import { listUpcomingInterviews, INTERVIEW_TYPE_LABELS, type Interview } from "../api/interviewsApi";
import InterviewFormModal, { type InterviewFormMode } from "./InterviewFormModal";

export interface UpcomingInterviewsBannerProps {
  // Bumped by the parent whenever any interview changes anywhere on the page, not just this banner's own modal.
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
  const knownIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    // Guard against out-of-order responses: rapid saves bump refreshSignal, so an earlier request can resolve after a later one. Also prevents setState after unmount.
    let ignore = false;
    async function refresh() {
      try {
        const data = await listUpcomingInterviews();
        if (ignore) return;
        const hasNewInterview = data.some(i => !knownIdsRef.current.has(i.stageEventId));
        knownIdsRef.current = new Set(data.map(i => i.stageEventId));
        setInterviews(data);
        // Resurface a dismissed banner only when a genuinely new interview appears; an unrelated save (e.g. editing notes) won't introduce a new id, so it won't reopen it.
        if (hasNewInterview) setDismissed(false);
      } catch {
        // Best-effort: a failed fetch just means no banner this load, not a page-level error.
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

  if (dismissed || interviews.length === 0) return null;

  return (
    <div className="mb-4 rounded border border-amber-300 bg-amber-50 p-4 text-left text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">Upcoming interviews:</p>
          <ul className="mt-1 space-y-1">
            {interviews.map(interview => (
              <li key={interview.stageEventId}>
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
