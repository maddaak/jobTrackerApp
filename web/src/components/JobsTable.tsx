import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  updateJob,
  deleteJob,
  rowColor,
  toUpdateJobInput,
  SOURCE_CATEGORIES,
  SOURCE_CATEGORY_LABELS,
  LOCATIONS,
  STAGE_ORDER,
  STAGE_LABELS,
  OUTCOMES,
  OUTCOME_LABELS,
  type JobSummary,
  type SourceCategory,
  type Location,
  type Stage,
  type Outcome,
} from "../api/jobsApi";
import {
  createInterview,
  deleteInterview,
  googleMapsUrl,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  type Interview,
  type InterviewType,
} from "../api/interviewsApi";
import InterviewFormModal, { type InterviewFormMode } from "./InterviewFormModal";
import JobDetailModal from "./JobDetailModal";

// Always-visible border + background, not just on focus — otherwise only the
// autoFocused field in a multi-input editor (e.g. Position's URL, Salary's max)
// looks editable, and the rest read as inert text.
const cellInputClass =
  "w-full rounded border border-neutral-300 bg-white px-1.5 py-1 text-sm text-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:disabled:border-neutral-700 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500";

const ROW_COLOR_CLASS: Record<"red" | "green" | "yellow", string> = {
  red: "bg-red-50 border-l-4 border-l-red-400 dark:bg-red-950/20 dark:border-l-red-500",
  green: "bg-green-50 border-l-4 border-l-green-400 dark:bg-green-950/20 dark:border-l-green-500",
  yellow: "bg-yellow-50 border-l-4 border-l-yellow-400 dark:bg-yellow-950/20 dark:border-l-yellow-500",
};

type EditableField = "position" | "company" | "salary" | "interview";

const INTERVIEW_STAGES: Stage[] = ["RECRUITER_CHAT_SCHEDULED", "INTERVIEW_SCHEDULING", "INTERVIEW_STAGE"];

interface InterviewerDraft {
  key: string;
  name: string;
  linkedInUrl: string;
}

interface InterviewDraft {
  interviewDateTime: string;
  interviewType: InterviewType | "";
  meetingLink: string;
  location: string;
  interviewers: InterviewerDraft[];
}

const EMPTY_INTERVIEW_DRAFT: InterviewDraft = {
  interviewDateTime: "",
  interviewType: "",
  meetingLink: "",
  location: "",
  interviewers: [],
};

function formatInterviewDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function effective<K extends keyof JobSummary>(
  job: JobSummary,
  pending: Record<number, Partial<JobSummary>>,
  field: K,
): JobSummary[K] {
  const value = pending[job.id]?.[field];
  return value === undefined ? job[field] : (value as JobSummary[K]);
}

function PencilIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M13.586 3.586a2 2 0 1 1 2.828 2.828l-.793.793-2.828-2.828.793-.793ZM11.379 5.793 3 14.172V17h2.828l8.38-8.379-2.83-2.828Z" />
    </svg>
  );
}

interface EditToggleCellProps {
  isEditing: boolean;
  onStartEdit: () => void;
  onDone: () => void;
  editLabel: string;
  display: ReactNode;
  editor: ReactNode;
  interactive?: boolean;
}

function EditToggleCell({ isEditing, onStartEdit, onDone, editLabel, display, editor, interactive = true }: EditToggleCellProps) {
  if (isEditing) {
    return (
      <div className="flex flex-col gap-1">
        {editor}
        <button
          type="button"
          onClick={onDone}
          className="self-start text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          Done
        </button>
      </div>
    );
  }
  return (
    // Same border/padding box as cellInputClass (just transparent) so this lines up with
    // the select/input cells beside it — otherwise plain display text sits flush at the
    // cell's top edge while a bordered input's text sits inset, and rows look misaligned.
    <div className="flex items-center justify-center gap-1.5 border border-transparent px-1.5 py-1">
      <div className="min-w-0 flex-1 text-sm">{display}</div>
      {interactive && (
        <button
          type="button"
          aria-label={editLabel}
          onClick={onStartEdit}
          className="shrink-0 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
        >
          <PencilIcon />
        </button>
      )}
    </div>
  );
}

export interface JobsTableProps {
  jobs: JobSummary[];
  onSaved: () => void;
  onDeleted: () => void;
}

const columnHelper = createColumnHelper<JobSummary>();

export default function JobsTable({ jobs, onSaved, onDeleted }: JobsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pendingEdits, setPendingEdits] = useState<Record<number, Partial<JobSummary>>>({});
  const [savingJobId, setSavingJobId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ jobId: number; field: EditableField } | null>(null);
  const [interviewDraft, setInterviewDraft] = useState<InterviewDraft>(EMPTY_INTERVIEW_DRAFT);
  const [interviewModalMode, setInterviewModalMode] = useState<InterviewFormMode | null>(null);
  const [detailModalJob, setDetailModalJob] = useState<JobSummary | null>(null);

  // Column cells are memoized once (see the useMemo below) so typing doesn't remount
  // every input on each keystroke — they read the latest values through these refs
  // instead of closing over pendingEdits/editingCell/jobs/onSaved/onDeleted directly.
  const pendingEditsRef = useRef(pendingEdits);
  pendingEditsRef.current = pendingEdits;
  const editingCellRef = useRef(editingCell);
  editingCellRef.current = editingCell;
  const interviewDraftRef = useRef(interviewDraft);
  interviewDraftRef.current = interviewDraft;
  const savingJobIdRef = useRef(savingJobId);
  savingJobIdRef.current = savingJobId;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;
  const nextInterviewerKeyRef = useRef(0);

  function newInterviewerKey(): string {
    nextInterviewerKeyRef.current += 1;
    return `new-${nextInterviewerKeyRef.current}`;
  }

  // New jobs land at the bottom by default (oldest first); clicking a header overrides this.
  const defaultOrderedJobs = useMemo(
    () => [...jobs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [jobs],
  );

  function setField<K extends keyof JobSummary>(jobId: number, field: K, value: JobSummary[K]) {
    setPendingEdits(prev => ({ ...prev, [jobId]: { ...prev[jobId], [field]: value } }));
  }

  function isEditingField(jobId: number, field: EditableField) {
    return editingCellRef.current?.jobId === jobId && editingCellRef.current.field === field;
  }

  // Saves the full current row (job ?? pending draft ?? this call's overrides) immediately —
  // this is the autosave commit point, used both by dropdowns (on change) and by the
  // pencil-icon fields (on Done).
  async function saveRow(jobId: number, overrides: Partial<JobSummary> = {}) {
    const original = jobsRef.current.find(j => j.id === jobId);
    if (!original) return;
    const merged = { ...original, ...pendingEditsRef.current[jobId], ...overrides };
    setSavingJobId(jobId);
    setError(null);
    try {
      await updateJob(jobId, toUpdateJobInput(merged));
      // Only drop the keys whose value still matches what we just saved — a field
      // edited again while this save was in flight has a newer value and must survive.
      setPendingEdits(prev => {
        const currentEdits = prev[jobId];
        if (!currentEdits) return prev;
        const remaining = Object.fromEntries(
          Object.entries(currentEdits).filter(([key, value]) => value !== merged[key as keyof JobSummary]),
        ) as Partial<JobSummary>;
        const next = { ...prev };
        if (Object.keys(remaining).length === 0) {
          delete next[jobId];
        } else {
          next[jobId] = remaining;
        }
        return next;
      });
      onSavedRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save changes");
    } finally {
      setSavingJobId(null);
    }
  }

  function handleDoneEditing(jobId: number) {
    setEditingCell(null);
    if (pendingEditsRef.current[jobId]) {
      saveRow(jobId);
    }
  }

  function openInterviewEditor(jobId: number) {
    setInterviewDraft(EMPTY_INTERVIEW_DRAFT);
    setEditingCell({ jobId, field: "interview" });
  }

  function cancelInterviewEditor() {
    setInterviewDraft(EMPTY_INTERVIEW_DRAFT);
    setEditingCell(null);
  }

  function addDraftInterviewer() {
    setInterviewDraft(prev => ({
      ...prev,
      interviewers: [...prev.interviewers, { key: newInterviewerKey(), name: "", linkedInUrl: "" }],
    }));
  }

  function removeDraftInterviewer(index: number) {
    setInterviewDraft(prev => ({ ...prev, interviewers: prev.interviewers.filter((_, i) => i !== index) }));
  }

  function updateDraftInterviewer(index: number, field: keyof InterviewerDraft, value: string) {
    setInterviewDraft(prev => ({
      ...prev,
      interviewers: prev.interviewers.map((interviewer, i) => (i === index ? { ...interviewer, [field]: value } : interviewer)),
    }));
  }

  // Always creates a new interview round — never updates an existing one. `latestInterview`
  // on JobSummary can point at an older round's StageEvent (a plain Stage-dropdown change
  // creates a fresh StageEvent with no interview details), so guessing "update vs create"
  // here risks silently overwriting a past round's data. Editing an existing round is the
  // calendar's job, where a specific entry is picked unambiguously.
  async function saveInterview(jobId: number) {
    const draft = interviewDraftRef.current;
    if (!draft.interviewDateTime) {
      cancelInterviewEditor();
      return;
    }
    const job = jobsRef.current.find(j => j.id === jobId);
    if (!job) return;

    setSavingJobId(jobId);
    setError(null);
    try {
      await createInterview({
        jobId,
        stage: effective(job, pendingEditsRef.current, "currentStage"),
        interviewDateTime: new Date(draft.interviewDateTime).toISOString(),
        interviewType: draft.interviewType || undefined,
        meetingLink: draft.meetingLink || undefined,
        location: draft.location || undefined,
        interviewers: draft.interviewers
          .filter(i => i.name.trim())
          .map(i => ({ name: i.name, linkedInUrl: i.linkedInUrl || undefined })),
      });
      cancelInterviewEditor();
      onSavedRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save interview");
    } finally {
      setSavingJobId(null);
    }
  }

  async function handleDeleteInterview(jobId: number, stageEventId: number) {
    if (!window.confirm("Delete this interview permanently?")) return;
    setSavingJobId(jobId);
    setError(null);
    try {
      await deleteInterview(stageEventId);
      onSavedRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete interview");
    } finally {
      setSavingJobId(null);
    }
  }

  // The table only holds the compact latestInterview summary; the modal (shared with the
  // calendar) needs a full Interview, which we can assemble from that summary plus fields
  // already on the job — no extra fetch needed.
  function openInterviewDetails(job: JobSummary) {
    if (!job.latestInterview) return;
    const interview: Interview = {
      ...job.latestInterview,
      jobId: job.id,
      company: job.company,
      role: job.role,
      stage: effective(job, pendingEditsRef.current, "currentStage"),
    };
    setInterviewModalMode({ kind: "edit", interview });
  }

  function handleInterviewModalSaved() {
    setInterviewModalMode(null);
    onSavedRef.current();
  }

  function handleInterviewModalDeleted() {
    setInterviewModalMode(null);
    onSavedRef.current();
  }

  async function handleDelete(jobId: number) {
    if (!window.confirm("Delete this job permanently?")) return;
    try {
      await deleteJob(jobId);
      setPendingEdits(prev => {
        const next = { ...prev };
        delete next[jobId];
        return next;
      });
      setEditingCell(prev => (prev?.jobId === jobId ? null : prev));
      onDeletedRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete job");
    }
  }

  const columns = useMemo<ColumnDef<JobSummary, any>[]>(() => [
    columnHelper.accessor("company", {
      header: "Company",
      size: 150,
      minSize: 100,
      cell: info => {
        const job = info.row.original;
        const value = effective(job, pendingEditsRef.current, "company");
        return (
          <EditToggleCell
            isEditing={isEditingField(job.id, "company")}
            onStartEdit={() => setEditingCell({ jobId: job.id, field: "company" })}
            onDone={() => handleDoneEditing(job.id)}
            editLabel={`Edit company for ${job.company}`}
            display={<span className="block truncate" title={value}>{value}</span>}
            editor={
              <input
                aria-label="Company"
                autoFocus
                className={cellInputClass}
                value={value}
                onChange={e => setField(job.id, "company", e.target.value)}
              />
            }
          />
        );
      },
    }),
    columnHelper.accessor("role", {
      id: "position",
      header: "Position",
      size: 220,
      minSize: 140,
      cell: info => {
        const job = info.row.original;
        const roleVal = effective(job, pendingEditsRef.current, "role");
        const urlVal = effective(job, pendingEditsRef.current, "url");
        return (
          <EditToggleCell
            isEditing={isEditingField(job.id, "position")}
            onStartEdit={() => setEditingCell({ jobId: job.id, field: "position" })}
            onDone={() => handleDoneEditing(job.id)}
            editLabel={`Edit position for ${job.company}`}
            display={
              urlVal ? (
                <a
                  href={urlVal}
                  target="_blank"
                  rel="noreferrer"
                  title={roleVal}
                  className="block truncate text-blue-600 hover:underline dark:text-blue-400"
                >
                  {roleVal}
                </a>
              ) : (
                <span className="block truncate" title={roleVal}>{roleVal}</span>
              )
            }
            editor={
              <div className="flex flex-col gap-1">
                <input
                  aria-label="Role"
                  autoFocus
                  className={cellInputClass}
                  value={roleVal}
                  placeholder="Role"
                  onChange={e => setField(job.id, "role", e.target.value)}
                />
                <input
                  aria-label="Position URL"
                  className={cellInputClass}
                  value={urlVal ?? ""}
                  placeholder="URL"
                  onChange={e => setField(job.id, "url", e.target.value)}
                />
              </div>
            }
          />
        );
      },
    }),
    columnHelper.accessor("sourceCategory", {
      header: "Application",
      size: 165,
      minSize: 130,
      cell: info => {
        const job = info.row.original;
        return (
          <select
            aria-label="Application"
            className={cellInputClass}
            disabled={savingJobIdRef.current === job.id}
            value={effective(job, pendingEditsRef.current, "sourceCategory")}
            onChange={e => {
              const value = e.target.value as SourceCategory;
              setField(job.id, "sourceCategory", value);
              saveRow(job.id, { sourceCategory: value });
            }}
          >
            {SOURCE_CATEGORIES.map(category => (
              <option key={category} value={category}>{SOURCE_CATEGORY_LABELS[category]}</option>
            ))}
          </select>
        );
      },
    }),
    columnHelper.accessor("location", {
      header: "Location",
      size: 150,
      minSize: 110,
      cell: info => {
        const job = info.row.original;
        const value = effective(job, pendingEditsRef.current, "location") ?? "";
        return (
          <select
            aria-label="Location"
            className={cellInputClass}
            disabled={savingJobIdRef.current === job.id}
            value={value}
            onChange={e => {
              const value = (e.target.value || null) as Location | null;
              setField(job.id, "location", value);
              saveRow(job.id, { location: value });
            }}
          >
            <option value="">Not set</option>
            {LOCATIONS.map(loc => (
              <option key={loc.value} value={loc.value}>{loc.label}</option>
            ))}
          </select>
        );
      },
    }),
    columnHelper.accessor("compMin", {
      id: "salary",
      header: "Salary Range",
      size: 170,
      minSize: 120,
      cell: info => {
        const job = info.row.original;
        const min = effective(job, pendingEditsRef.current, "compMin");
        const max = effective(job, pendingEditsRef.current, "compMax");
        const displayText =
          min != null || max != null
            ? `${min != null ? min.toLocaleString() : "?"} – ${max != null ? max.toLocaleString() : "?"}`
            : "—";
        return (
          <EditToggleCell
            isEditing={isEditingField(job.id, "salary")}
            onStartEdit={() => setEditingCell({ jobId: job.id, field: "salary" })}
            onDone={() => handleDoneEditing(job.id)}
            editLabel={`Edit salary for ${job.company}`}
            display={<span className="block truncate">{displayText}</span>}
            editor={
              <div className="flex gap-1">
                <input
                  aria-label="Comp min"
                  autoFocus
                  type="number"
                  className={cellInputClass}
                  value={min ?? ""}
                  onChange={e => setField(job.id, "compMin", e.target.value ? Number(e.target.value) : null)}
                />
                <input
                  aria-label="Comp max"
                  type="number"
                  className={cellInputClass}
                  value={max ?? ""}
                  onChange={e => setField(job.id, "compMax", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
            }
          />
        );
      },
    }),
    columnHelper.accessor("currentStage", {
      header: "Stage",
      size: 260,
      minSize: 180,
      cell: info => {
        const job = info.row.original;
        const currentStage = effective(job, pendingEditsRef.current, "currentStage");
        const isInterviewStage = INTERVIEW_STAGES.includes(currentStage);
        const isAddingInterview = isEditingField(job.id, "interview");

        return (
          <div className="flex flex-col gap-1">
            <select
              aria-label="Stage"
              className={cellInputClass}
              disabled={savingJobIdRef.current === job.id}
              value={currentStage}
              onChange={e => {
                const value = e.target.value as Stage;
                setField(job.id, "currentStage", value);
                saveRow(job.id, { currentStage: value });
              }}
            >
              {STAGE_ORDER.map(stage => (
                <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>
              ))}
            </select>

            {isInterviewStage && !isAddingInterview && (
              <div className="flex flex-col items-start gap-0.5 text-xs">
                {job.latestInterview && (
                  <>
                    <span className="flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
                      <button
                        type="button"
                        onClick={() => openInterviewDetails(job)}
                        className="hover:underline hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {job.latestInterview.roundCount > 1 && `${job.latestInterview.roundCount} rounds · latest `}
                        {formatInterviewDateTime(job.latestInterview.interviewDateTime)}
                        {job.latestInterview.interviewType && ` · ${INTERVIEW_TYPE_LABELS[job.latestInterview.interviewType]}`}
                      </button>
                      <button
                        type="button"
                        aria-label="Delete interview"
                        onClick={() => handleDeleteInterview(job.id, job.latestInterview!.stageEventId)}
                        className="text-red-600 hover:underline dark:text-red-400"
                      >
                        ✕
                      </button>
                    </span>
                    {job.latestInterview.roundCount > 1 && (
                      <Link to="/calendar" className="text-blue-600 hover:underline dark:text-blue-400">
                        See all rounds on calendar
                      </Link>
                    )}
                  </>
                )}
                <button
                  type="button"
                  onClick={() => openInterviewEditor(job.id)}
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  + Add interview
                </button>
              </div>
            )}

            {isAddingInterview && (
              <div className="flex flex-col gap-1">
                <input
                  aria-label="Interview date and time"
                  type="datetime-local"
                  autoFocus
                  className={cellInputClass}
                  value={interviewDraftRef.current.interviewDateTime}
                  onChange={e => setInterviewDraft(prev => ({ ...prev, interviewDateTime: e.target.value }))}
                />
                <select
                  aria-label="Interview type"
                  className={cellInputClass}
                  value={interviewDraftRef.current.interviewType}
                  onChange={e => setInterviewDraft(prev => ({ ...prev, interviewType: e.target.value as InterviewType }))}
                >
                  <option value="">Select type</option>
                  {INTERVIEW_TYPES.map(type => (
                    <option key={type} value={type}>{INTERVIEW_TYPE_LABELS[type]}</option>
                  ))}
                </select>
                <input
                  aria-label="Meeting link"
                  placeholder="Meeting link"
                  className={cellInputClass}
                  value={interviewDraftRef.current.meetingLink}
                  onChange={e => setInterviewDraft(prev => ({ ...prev, meetingLink: e.target.value }))}
                />
                <input
                  aria-label="Interview location"
                  placeholder="Location (if in person)"
                  className={cellInputClass}
                  value={interviewDraftRef.current.location}
                  onChange={e => setInterviewDraft(prev => ({ ...prev, location: e.target.value }))}
                />
                {interviewDraftRef.current.location && (
                  <a
                    href={googleMapsUrl(interviewDraftRef.current.location)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Open in Google Maps ↗
                  </a>
                )}
                {interviewDraftRef.current.interviewers.map((interviewer, index) => (
                  <div key={interviewer.key} className="flex items-center gap-1">
                    <input
                      aria-label="Interviewer name"
                      placeholder="Interviewer name"
                      className={cellInputClass}
                      value={interviewer.name}
                      onChange={e => updateDraftInterviewer(index, "name", e.target.value)}
                    />
                    <input
                      aria-label="Interviewer LinkedIn URL"
                      placeholder="LinkedIn URL"
                      className={cellInputClass}
                      value={interviewer.linkedInUrl}
                      onChange={e => updateDraftInterviewer(index, "linkedInUrl", e.target.value)}
                    />
                    <button
                      type="button"
                      aria-label="Remove interviewer"
                      onClick={() => removeDraftInterviewer(index)}
                      className="shrink-0 text-red-600 hover:underline dark:text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addDraftInterviewer}
                  className="text-left text-xs text-blue-600 hover:underline dark:text-blue-400"
                >
                  + Add interviewer
                </button>
                <div className="flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => saveInterview(job.id)}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={cancelInterviewEditor}
                    className="text-neutral-500 hover:underline dark:text-neutral-400"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor("outcome", {
      header: "Outcome",
      size: 150,
      minSize: 110,
      cell: info => {
        const job = info.row.original;
        return (
          <select
            aria-label="Outcome"
            className={cellInputClass}
            disabled={savingJobIdRef.current === job.id}
            value={effective(job, pendingEditsRef.current, "outcome")}
            onChange={e => {
              const value = e.target.value as Outcome;
              setField(job.id, "outcome", value);
              saveRow(job.id, { outcome: value });
              // Rejected reason lives in the Details modal now — jump straight there so
              // it doesn't get left blank after picking Rejected.
              if (value === "REJECTED") {
                setDetailModalJob({ ...job, outcome: value });
              }
            }}
          >
            {OUTCOMES.map(outcome => (
              <option key={outcome} value={outcome}>{OUTCOME_LABELS[outcome]}</option>
            ))}
          </select>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      size: 130,
      minSize: 100,
      cell: info => {
        const job = info.row.original;
        if (savingJobIdRef.current === job.id) {
          return <span className="block border border-transparent px-1.5 py-1 text-xs text-neutral-400">Saving…</span>;
        }
        return (
          <div className="flex items-center justify-between gap-2 border border-transparent px-1.5 py-1">
            <button
              type="button"
              onClick={() => setDetailModalJob(job)}
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Details
            </button>
            <button
              type="button"
              aria-label={`Delete ${job.company} ${job.role}`}
              className="text-lg leading-none text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
              onClick={() => handleDelete(job.id)}
            >
              ✕
            </button>
          </div>
        );
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], []);

  const table = useReactTable({
    data: defaultOrderedJobs,
    columns,
    columnResizeMode: "onChange",
    enableColumnResizing: true,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex h-full min-w-0 flex-col">
      {error && <p role="alert" className="mb-2 shrink-0 text-sm text-red-600 dark:text-red-400">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto">
        <table
          style={{ width: "100%", minWidth: table.getTotalSize() }}
          className="table-fixed border-collapse text-sm"
        >
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize(), backgroundColor: "var(--bg)" }}
                    className="sticky top-0 z-10 border-b border-neutral-300 px-2 py-2 text-left font-medium text-neutral-900 dark:border-neutral-700 dark:text-neutral-100"
                  >
                    <div
                      className="cursor-pointer select-none truncate text-center"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === "asc" && " ▲"}
                      {header.column.getIsSorted() === "desc" && " ▼"}
                    </div>
                    <div
                      onMouseDown={header.getResizeHandler()}
                      onTouchStart={header.getResizeHandler()}
                      className={`absolute right-0 top-0 h-full w-1.5 cursor-col-resize touch-none select-none ${
                        header.column.getIsResizing() ? "bg-blue-500" : "hover:bg-neutral-400 dark:hover:bg-neutral-500"
                      }`}
                    />
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => {
              const job = row.original;
              const merged = { ...job, ...pendingEdits[job.id] };
              return (
                <tr key={row.id} className={ROW_COLOR_CLASS[rowColor(merged)]}>
                  {row.getVisibleCells().map(cell => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="border-b border-neutral-200 px-2 py-1 align-top dark:border-neutral-800"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <InterviewFormModal
        mode={interviewModalMode}
        onClose={() => setInterviewModalMode(null)}
        onSaved={handleInterviewModalSaved}
        onDeleted={handleInterviewModalDeleted}
      />

      <JobDetailModal
        job={detailModalJob}
        onClose={() => setDetailModalJob(null)}
        onSaved={() => onSavedRef.current()}
      />
    </div>
  );
}
