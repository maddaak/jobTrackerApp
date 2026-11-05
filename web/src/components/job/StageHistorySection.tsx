import { useEffect, useState } from "react";
import { deleteJobStage, getJobStages, STAGE_LABELS, type Stage, type StageHistoryEntry } from "../../api/jobsApi";

export interface StageHistorySectionProps {
  jobId: number;
  // A move made elsewhere in the modal (status, a new round) adds an entry, so a new stage reloads the list.
  currentStage: Stage;
  onError: (message: string) => void;
  onChanged: () => void;
}

function formatEnteredAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function StageHistorySection({ jobId, currentStage, onError, onChanged }: StageHistorySectionProps) {
  const [history, setHistory] = useState<StageHistoryEntry[]>([]);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    // Ignore a response that resolves after the user switched jobs, else A's history shows on B.
    let ignore = false;
    getJobStages(jobId)
      .then(loaded => { if (!ignore) setHistory(loaded); })
      .catch(err => { if (!ignore) onError(err instanceof Error ? err.message : "failed to load stage history"); });
    return () => { ignore = true; };
  }, [jobId, currentStage, onError]);

  // Cleared only on a switch of job, so a reload for a new stage doesn't blank the list while it loads.
  useEffect(() => { setHistory([]); }, [jobId]);

  // Waiting is a pause within the stage before it, so it folds into that row like repeats do. A row keeps
  // every entry it covers, since deleting only the first would re-render identically and read as a no-op.
  const rows = history.reduce<{ stage: Stage; enteredAt: string; run: StageHistoryEntry[] }[]>((acc, entry) => {
    const last = acc[acc.length - 1];
    if (last && (last.stage === entry.stage || entry.stage === "WAITING_INTERVIEW_RESULTS")) {
      last.run.push(entry);
      return acc;
    }
    acc.push({ stage: entry.stage, enteredAt: entry.enteredAt, run: [entry] });
    return acc;
  }, []);

  async function handleDelete(run: StageHistoryEntry[]) {
    setDeleting(true);
    let remaining = history;
    try {
      for (const entry of run) {
        remaining = await deleteJobStage(jobId, entry.enteredAt, entry.stage);
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "failed to delete stage entry");
    } finally {
      // A run deletes one entry per call, so a mid-run failure still leaves real deletions to show.
      setHistory(remaining);
      // Deleting rewinds the job's stage, so the page holding it needs a fresh copy.
      onChanged();
      setDeleting(false);
    }
  }

  return (
    <div>
      <p className="mb-1 block text-sm font-medium">Stage history</p>
      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No stage history yet.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {rows.map(row => (
            <li key={`${row.stage}-${row.enteredAt}`} className="flex items-center gap-2">
              <span className="font-medium">{STAGE_LABELS[row.stage]}</span>
              <span className="text-neutral-500 dark:text-neutral-400">{formatEnteredAt(row.enteredAt)}</span>
              {history.length > row.run.length && (
                <button
                  type="button"
                  aria-label={`Delete ${STAGE_LABELS[row.stage]} history entry`}
                  disabled={deleting}
                  onClick={() => handleDelete(row.run)}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  Delete
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
