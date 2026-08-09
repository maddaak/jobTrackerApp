import { useEffect, useState, type FormEvent } from "react";
import Modal from "./Modal";
import { safeHref } from "../safeHref";
import {
  getJobDetail,
  getJobStages,
  updateJobDetail,
  STAGE_LABELS,
  type JobSummary,
  type StageHistoryEntry,
} from "../api/jobsApi";
import { listInterviews, INTERVIEW_TYPE_LABELS, type Interview } from "../api/interviewsApi";

export interface JobDetailModalProps {
  job: JobSummary | null;
  onClose: () => void;
  onSaved: () => void;
}

const textareaClass =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium";

function formatRoundDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function JobDetailModal({ job, onClose, onSaved }: JobDetailModalProps) {
  const [notes, setNotes] = useState("");
  const [rejectedReason, setRejectedReason] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [jdText, setJdText] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rounds, setRounds] = useState<Interview[]>([]);
  const [stageHistory, setStageHistory] = useState<StageHistoryEntry[]>([]);
  const [recommendedResume, setRecommendedResume] = useState<string | null>(null);

  useEffect(() => {
    if (!job) return;
    // Ignore a response that resolves after the user switched jobs, else A's load overwrites B.
    let ignore = false;
    setNotes("");
    setRejectedReason("");
    setLoading(true);
    setError(null);
    setRounds([]);
    setStageHistory([]);
    setRecommendedResume(null);
    getJobDetail(job.id)
      .then(detail => {
        if (ignore) return;
        setJdText(detail.jdText);
        setInterviewNotes(detail.interviewNotes);
        setRecommendedResume(detail.recommendedResume);
        setNotes(detail.notes ?? "");
        setRejectedReason(detail.rejectedReason ?? "");
      })
      .catch(err => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "failed to load job detail");
      })
      .finally(() => {
        if (ignore) return;
        setLoading(false);
      });
    listInterviews()
      .then(all => {
        if (ignore) return;
        setRounds(
          all
            .filter(i => i.jobId === job.id)
            .sort((a, b) => a.interviewDateTime.localeCompare(b.interviewDateTime)),
        );
      })
      .catch(err => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "failed to load interview rounds");
      });
    getJobStages(job.id)
      .then(history => {
        if (ignore) return;
        setStageHistory(history);
      })
      .catch(err => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "failed to load stage history");
      });
    return () => {
      ignore = true;
    };
  }, [job]);

  const rejectedReasonEnabled = job?.outcome === "REJECTED";

  // Collapse consecutive duplicate stages into one entry.
  const dedupedStages = stageHistory.filter(
    (entry, i) => i === 0 || entry.stage !== stageHistory[i - 1].stage,
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!job) return;
    setSaving(true);
    setError(null);
    try {
      // Everything this modal edits is on the detail document now, so one store, one call.
      await updateJobDetail(job.id, { jdText, interviewNotes, notes, rejectedReason });
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

          {recommendedResume && (
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              <span className="font-medium">Recommended resume:</span> <span>{recommendedResume}</span>
            </p>
          )}

          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          {loading && <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>}

          <div>
            <p className={labelClass}>Stage history</p>
            {dedupedStages.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No stage history yet.</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {dedupedStages.map((entry, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-medium">{STAGE_LABELS[entry.stage]}</span>
                    <span className="text-neutral-500 dark:text-neutral-400">{formatRoundDateTime(entry.enteredAt)}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <p className={labelClass}>Interview rounds</p>
            {rounds.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">No interview rounds yet.</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {rounds.map((round, i) => (
                  <li
                    key={round.roundId}
                    className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700"
                  >
                    <span className="font-medium">Round {i + 1}:</span>{" "}
                    {formatRoundDateTime(round.interviewDateTime)}
                    {round.interviewType && ` · ${INTERVIEW_TYPE_LABELS[round.interviewType]}`}
                    {round.interviewers.length > 0 && (
                      <span className="text-neutral-500 dark:text-neutral-400">
                        {" · "}{round.interviewers.map(iv => iv.name).join(", ")}
                      </span>
                    )}
                    {safeHref(round.meetingLink) && (
                      <>
                        {" · "}
                        <a
                          href={safeHref(round.meetingLink)}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-600 hover:underline dark:text-blue-400"
                        >
                          Join ↗
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

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
                {safeHref(job.url) && (
                  <a
                    href={safeHref(job.url)}
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
