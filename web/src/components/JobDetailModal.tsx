import { useCallback, useEffect, useState, type FormEvent } from "react";
import Modal from "./Modal";
import JobImageAttachments from "./JobImageAttachments";
import InterviewRoundsSection from "./job/InterviewRoundsSection";
import JobStatusControls from "./job/JobStatusControls";
import LinkedJobsSection from "./job/LinkedJobsSection";
import ContactsSection from "./job/ContactsSection";
import SeasonPicker from "./job/SeasonPicker";
import SentResumePicker from "./job/SentResumePicker";
import StageHistorySection from "./job/StageHistorySection";
import JobAiPanels from "./ai/JobAiPanels";
import { safeHref } from "../safeHref";
import type { JobAiResults } from "../api/aiApi";
import { getJobDetail, updateJobDetail, type Contact, type JobLink, type JobSummary } from "../api/jobsApi";
import { useAuth } from "../hooks/useAuth";

export interface JobDetailModalProps {
  job: JobSummary | null;
  allJobs: JobSummary[];
  onClose: () => void;
  onSaved: () => void;
}

const textareaClass =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium";

export default function JobDetailModal({ job, allJobs, onClose, onSaved }: JobDetailModalProps) {
  const [notes, setNotes] = useState("");
  const [rejectedReason, setRejectedReason] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");
  const [jdText, setJdText] = useState("");
  const [recommendedResume, setRecommendedResume] = useState<string | null>(null);
  const [sentResume, setSentResume] = useState<string | null>(null);
  const [links, setLinks] = useState<JobLink[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [aiResults, setAiResults] = useState<JobAiResults>({});
  const { aiConfigured } = useAuth();
  const [loading, setLoading] = useState(false);
  // Save stays off until this job's details have loaded, or it would write the last job's text into this one.
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Keyed on the id, not the object: the page refreshes the job after every change made in here.
  const jobId = job?.id;

  useEffect(() => {
    if (jobId === undefined) return;
    // Ignore a response that resolves after the user switched jobs, else A's load overwrites B.
    let ignore = false;
    setJdText("");
    setInterviewNotes("");
    setNotes("");
    setRejectedReason("");
    setRecommendedResume(null);
    setSentResume(null);
    setLinks([]);
    setContacts([]);
    setAiResults({});
    setDetailLoaded(false);
    setLoading(true);
    setError(null);
    getJobDetail(jobId)
      .then(detail => {
        if (ignore) return;
        setJdText(detail.jdText);
        setInterviewNotes(detail.interviewNotes);
        setRecommendedResume(detail.recommendedResume);
        setSentResume(detail.sentResume ?? null);
        setNotes(detail.notes ?? "");
        setRejectedReason(detail.rejectedReason ?? "");
        setLinks(detail.links ?? []);
        setContacts(detail.contacts ?? []);
        setAiResults(detail.aiResults ?? {});
        setDetailLoaded(true);
      })
      .catch(err => {
        if (ignore) return;
        setError(err instanceof Error ? err.message : "failed to load job detail");
      })
      .finally(() => {
        if (ignore) return;
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [jobId]);

  // Stable, so the sections' load effects don't rerun on every render.
  const showError = useCallback((message: string) => setError(message), []);

  const rejectedReasonEnabled = job?.outcome === "REJECTED";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!job) return;
    setSaving(true);
    setError(null);
    try {
      // Everything this form edits is on the detail document, so one store, one call.
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
    <Modal open={job !== null} onClose={onClose} title="Job details" wide>
      {job && (
        <div className="space-y-4">
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

          <JobStatusControls job={job} onError={showError} onChanged={onSaved} />

          <SeasonPicker job={job} onError={showError} onChanged={onSaved} />

          {detailLoaded && (
            <SentResumePicker jobId={job.id} sentResume={sentResume} onChange={setSentResume} onError={showError} />
          )}

          <InterviewRoundsSection jobId={job.id} onError={showError} onChanged={onSaved} />

          {detailLoaded && (
            <ContactsSection jobId={job.id} contacts={contacts} onContactsChange={setContacts} onError={showError} />
          )}

          {aiConfigured && detailLoaded && <JobAiPanels key={job.id} job={job}results={aiResults} onChange={setAiResults} />}

          <StageHistorySection jobId={job.id} currentStage={job.currentStage} onError={showError} onChanged={onSaved} />

          <LinkedJobsSection
            job={job}
            allJobs={allJobs}
            links={links}
            onLinksChange={setLinks}
            onError={showError}
            onChanged={onSaved}
          />

          <JobImageAttachments jobId={job.id} />

          {/* Only the text fields: React bubbles a nested dialog's submit through its portal into an enclosing form. */}
          <form onSubmit={handleSubmit} className="space-y-4">
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
                disabled={saving || !detailLoaded}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </Modal>
  );
}
