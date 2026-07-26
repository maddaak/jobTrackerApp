import { useEffect, useState, type FormEvent } from "react";
import Modal from "./Modal";
import { getJobDetail, updateJob, updateJobDetail, toUpdateJobInput, type JobSummary } from "../api/jobsApi";

export interface JobDetailModalProps {
  job: JobSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

const textareaClass =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium";

export default function JobDetailModal({ job, onClose, onSaved }: JobDetailModalProps) {
  const [notes, setNotes] = useState("");
  const [rejectedReason, setRejectedReason] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;
    setNotes(job.notes ?? "");
    setRejectedReason(job.rejectedReason ?? "");
    setLoading(true);
    setError(null);
    getJobDetail(job.id)
      .then(detail => {
        setJdText(detail.jdText);
        setInterviewNotes(detail.interviewNotes);
      })
      .catch(err => setError(err instanceof Error ? err.message : "failed to load job detail"))
      .finally(() => setLoading(false));
  }, [job]);

  const rejectedReasonEnabled = job?.outcome === "REJECTED";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!job) return;
    setSaving(true);
    setError(null);
    try {
      await Promise.all([
        updateJob(job.id, { ...toUpdateJobInput(job), notes, rejectedReason: rejectedReasonEnabled ? rejectedReason : null }),
        updateJobDetail(job.id, { jdText, interviewNotes }),
      ]);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save job detail");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={job !== null} onClose={onClose} title="Job details">
      {job && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {job.company} — {job.role}
          </p>

          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {loading && <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>}

          <div>
            <label htmlFor="job-notes" className={labelClass}>Notes</label>
            <textarea
              id="job-notes"
              rows={3}
              className={textareaClass}
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="rejected-reason" className={labelClass}>Rejected reason</label>
            <textarea
              id="rejected-reason"
              rows={3}
              disabled={!rejectedReasonEnabled}
              className={`${textareaClass} disabled:bg-neutral-100 disabled:text-neutral-400 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500`}
              value={rejectedReasonEnabled ? rejectedReason : ""}
              onChange={e => setRejectedReason(e.target.value)}
              placeholder={rejectedReasonEnabled ? "" : "Only applies when outcome is Rejected"}
            />
          </div>

          <div>
            <label htmlFor="interview-notes" className={labelClass}>Interview notes</label>
            <textarea
              id="interview-notes"
              rows={3}
              className={textareaClass}
              value={interviewNotes}
              onChange={e => setInterviewNotes(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="jd-text" className={labelClass}>Job description</label>
            {!loading && !jdText && (
              <div className="mb-2 rounded border border-neutral-300 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-800">
                <p className="font-medium text-neutral-700 dark:text-neutral-300">Job Description Details Unavailable</p>
                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  We couldn't pull the description automatically — sometimes the posting gets taken down after you apply.
                </p>
                {job.url && (
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Open original posting ↗
                  </a>
                )}
              </div>
            )}
            <textarea
              id="jd-text"
              rows={6}
              className={textareaClass}
              value={jdText}
              onChange={e => setJdText(e.target.value)}
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
