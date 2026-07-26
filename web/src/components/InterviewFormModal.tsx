import { useEffect, useRef, useState, type FormEvent } from "react";
import Modal from "./Modal";
import { listJobs, type JobSummary } from "../api/jobsApi";
import {
  createInterview,
  updateInterview,
  deleteInterview,
  googleMapsUrl,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  type Interview,
  type InterviewType,
} from "../api/interviewsApi";

interface InterviewerDraft {
  key: string;
  name: string;
  linkedInUrl: string;
}

export type InterviewFormMode =
  | { kind: "create"; date: Date }
  | { kind: "edit"; interview: Interview };

export interface InterviewFormModalProps {
  mode: InterviewFormMode | null;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium";

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function InterviewFormModal({ mode, onClose, onSaved, onDeleted }: InterviewFormModalProps) {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [jobId, setJobId] = useState<number | "">("");
  const [interviewDateTime, setInterviewDateTime] = useState("");
  const [interviewType, setInterviewType] = useState<InterviewType | "">("");
  const [meetingLink, setMeetingLink] = useState("");
  const [location, setLocation] = useState("");
  const [interviewers, setInterviewers] = useState<InterviewerDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const nextKeyRef = useRef(0);

  function newInterviewerKey(): string {
    nextKeyRef.current += 1;
    return `new-${nextKeyRef.current}`;
  }

  useEffect(() => {
    if (!mode) return;
    setError(null);
    if (mode.kind === "create") {
      listJobs().then(setJobs).catch(() => setJobs([]));
      setJobId("");
      setInterviewDateTime(toDatetimeLocalValue(mode.date));
      setInterviewType("");
      setMeetingLink("");
      setLocation("");
      setInterviewers([]);
    } else {
      setInterviewDateTime(toDatetimeLocalValue(new Date(mode.interview.interviewDateTime)));
      setInterviewType(mode.interview.interviewType ?? "");
      setMeetingLink(mode.interview.meetingLink ?? "");
      setLocation(mode.interview.location ?? "");
      setInterviewers(
        mode.interview.interviewers.map(i => ({ key: `existing-${i.id}`, name: i.name, linkedInUrl: i.linkedInUrl ?? "" })),
      );
    }
  }, [mode]);

  function addInterviewer() {
    setInterviewers(prev => [...prev, { key: newInterviewerKey(), name: "", linkedInUrl: "" }]);
  }

  function removeInterviewer(index: number) {
    setInterviewers(prev => prev.filter((_, i) => i !== index));
  }

  function updateInterviewer(index: number, field: keyof InterviewerDraft, value: string) {
    setInterviewers(prev => prev.map((interviewer, i) => (i === index ? { ...interviewer, [field]: value } : interviewer)));
  }

  function toInterviewerInputs() {
    return interviewers
      .filter(i => i.name.trim())
      .map(i => ({ name: i.name, linkedInUrl: i.linkedInUrl || undefined }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!mode) return;
    setSaving(true);
    setError(null);
    try {
      if (mode.kind === "create") {
        if (!jobId) {
          throw new Error("select a job");
        }
        await createInterview({
          jobId,
          stage: "INTERVIEW_STAGE",
          interviewDateTime: new Date(interviewDateTime).toISOString(),
          interviewType: interviewType || undefined,
          meetingLink: meetingLink || undefined,
          location: location || undefined,
          interviewers: toInterviewerInputs(),
        });
      } else {
        await updateInterview(mode.interview.stageEventId, {
          interviewDateTime: new Date(interviewDateTime).toISOString(),
          interviewType: interviewType || null,
          meetingLink: meetingLink || null,
          location: location || null,
          interviewers: toInterviewerInputs(),
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save interview");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (mode?.kind !== "edit") return;
    if (!window.confirm("Delete this interview permanently?")) return;
    setSaving(true);
    setError(null);
    try {
      await deleteInterview(mode.interview.stageEventId);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete interview");
      setSaving(false);
    }
  }

  return (
    <Modal open={mode !== null} onClose={onClose} title={mode?.kind === "edit" ? "Edit interview" : "Add interview"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {mode?.kind === "edit" && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            {mode.interview.company} — {mode.interview.role}
          </p>
        )}

        {mode?.kind === "create" && (
          <div>
            <label htmlFor="interview-job" className={labelClass}>Job</label>
            <select
              id="interview-job"
              className={inputClass}
              value={jobId}
              onChange={e => setJobId(e.target.value ? Number(e.target.value) : "")}
              required
            >
              <option value="">Select a job</option>
              {jobs.map(job => (
                <option key={job.id} value={job.id}>{job.company} — {job.role}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label htmlFor="interview-datetime" className={labelClass}>Date and time</label>
          <input
            id="interview-datetime"
            type="datetime-local"
            className={inputClass}
            value={interviewDateTime}
            onChange={e => setInterviewDateTime(e.target.value)}
            required
          />
        </div>

        <div>
          <label htmlFor="interview-type" className={labelClass}>Type</label>
          <select
            id="interview-type"
            className={inputClass}
            value={interviewType}
            onChange={e => setInterviewType(e.target.value as InterviewType)}
          >
            <option value="">Select type</option>
            {INTERVIEW_TYPES.map(type => (
              <option key={type} value={type}>{INTERVIEW_TYPE_LABELS[type]}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="interview-link" className={labelClass}>Meeting link</label>
          <input id="interview-link" className={inputClass} value={meetingLink} onChange={e => setMeetingLink(e.target.value)} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label htmlFor="interview-location" className={labelClass + " mb-0"}>Location (if in person)</label>
            {location && (
              <a
                href={googleMapsUrl(location)}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                Open in Google Maps ↗
              </a>
            )}
          </div>
          <input id="interview-location" className={inputClass} value={location} onChange={e => setLocation(e.target.value)} />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className={labelClass + " mb-0"}>Interviewers</span>
            <button
              type="button"
              onClick={addInterviewer}
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              + Add interviewer
            </button>
          </div>
          <div className="space-y-2">
            {interviewers.map((interviewer, index) => (
              <div key={interviewer.key} className="flex items-center gap-2">
                <input
                  aria-label="Interviewer name"
                  placeholder="Name"
                  className={inputClass}
                  value={interviewer.name}
                  onChange={e => updateInterviewer(index, "name", e.target.value)}
                />
                <input
                  aria-label="Interviewer LinkedIn URL"
                  placeholder="LinkedIn URL"
                  className={inputClass}
                  value={interviewer.linkedInUrl}
                  onChange={e => updateInterviewer(index, "linkedInUrl", e.target.value)}
                />
                {interviewer.linkedInUrl && (
                  <a
                    href={interviewer.linkedInUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="whitespace-nowrap text-xs text-blue-600 hover:underline dark:text-blue-400"
                  >
                    View ↗
                  </a>
                )}
                <button
                  type="button"
                  aria-label="Remove interviewer"
                  onClick={() => removeInterviewer(index)}
                  className="text-red-600 hover:underline dark:text-red-400"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between">
          {mode?.kind === "edit" ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
            >
              Delete interview
            </button>
          ) : (
            <span />
          )}
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {mode?.kind === "edit" ? "Save changes" : "Add interview"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
