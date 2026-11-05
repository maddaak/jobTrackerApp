import { useEffect, useState, type FormEvent } from "react";
import Modal from "./Modal";
import {
  CLOSED_OUTCOMES,
  OUTCOME_LABELS,
  toUpdateJobInput,
  updateJob,
  updateJobDetail,
  type JobSummary,
  type Outcome,
} from "../api/jobsApi";

export interface CloseJobDialogProps {
  job: JobSummary | null;
  onClose: () => void;
  // Called once the job is closed, with a warning if the reason alone failed to save.
  onClosed: (warning?: string) => void;
}

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";

export default function CloseJobDialog({ job, onClose, onClosed }: CloseJobDialogProps) {
  const [outcome, setOutcome] = useState<Outcome>("REJECTED");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setOutcome("REJECTED");
    setReason("");
    setError(null);
  }, [job]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!job) return;
    setSaving(true);
    setError(null);
    try {
      // core moves a closed job to FINALIZED itself, so only the outcome changes here.
      await updateJob(job.id, { ...toUpdateJobInput(job), outcome });
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to close job");
      setSaving(false);
      return;
    }
    // The job is closed now whatever happens next, so the page must refresh either way.
    let warning: string | undefined;
    if (outcome === "REJECTED" && reason.trim()) {
      try {
        await updateJobDetail(job.id, { rejectedReason: reason.trim() });
      } catch {
        warning = "Job closed, but the rejected reason didn't save. Add it from the job's details.";
      }
    }
    setSaving(false);
    onClosed(warning);
  }

  return (
    <Modal open={job !== null} onClose={onClose} title="Close job">
      {job && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">{job.company} — {job.role}</p>
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

          <fieldset className="space-y-1">
            <legend className="mb-1 text-sm font-medium">Outcome</legend>
            {CLOSED_OUTCOMES.map(option => (
              <label key={option} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="outcome"
                  value={option}
                  checked={outcome === option}
                  onChange={() => setOutcome(option)}
                />
                {OUTCOME_LABELS[option]}
              </label>
            ))}
          </fieldset>

          {outcome === "REJECTED" && (
            <div>
              <label htmlFor="close-reason" className="mb-1 block text-sm font-medium">Rejected reason</label>
              <textarea
                id="close-reason"
                rows={3}
                className={inputClass}
                value={reason}
                onChange={e => setReason(e.target.value)}
              />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
            >
              Close job
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
