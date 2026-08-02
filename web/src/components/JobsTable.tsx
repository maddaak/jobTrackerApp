import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnFiltersState,
  type Row,
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
  INTERVIEW_TYPE_LABELS,
  type Interview,
} from "../api/interviewsApi";
import InterviewFormModal, { type InterviewFormMode } from "./InterviewFormModal";
import InlineInterviewEditor, { type InlineInterviewDraft } from "./InlineInterviewEditor";
import { ColumnFilterPopover } from "./JobsTableFilters";
import JobDetailModal from "./JobDetailModal";
import { safeHref } from "../safeHref";

// Always-visible border, not just on focus; otherwise only the autoFocused field in a multi-input editor looks editable and the rest read as inert text.
const cellInputClass =
  "w-full rounded border border-neutral-300 bg-white px-1.5 py-1 text-sm text-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:disabled:border-neutral-700 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500";

const ROW_BG_CLASS: Record<"red" | "green" | "yellow", string> = {
  red: "bg-red-50 dark:bg-red-950/20",
  green: "bg-green-50 dark:bg-green-950/20",
  yellow: "bg-yellow-50 dark:bg-yellow-950/20",
};

// The left accent lives on the first cell (not the row) because row borders don't render in
// the border-separate model the sticky header needs to stop content bleeding through it.
const ROW_ACCENT_CLASS: Record<"red" | "green" | "yellow", string> = {
  red: "border-l-4 border-l-red-400 dark:border-l-red-500",
  green: "border-l-4 border-l-green-400 dark:border-l-green-500",
  yellow: "border-l-4 border-l-yellow-400 dark:border-l-yellow-500",
};

const LOCATION_LABELS: Record<string, string> = Object.fromEntries(LOCATIONS.map(l => [l.value, l.label]));

// Undefined = no filter (all checked); an empty array = nothing checked, so no row matches.
function listFilter(row: Row<JobSummary>, columnId: string, value: unknown): boolean {
  if (!Array.isArray(value)) return true;
  return value.includes(row.getValue(columnId));
}

function salaryFilter(row: Row<JobSummary>, _columnId: string, value: string): boolean {
  if (!value) return true;
  const min = Number(value);
  if (Number.isNaN(min)) return true;
  const top = row.original.compMax ?? row.original.compMin;
  return top != null && top >= min;
}

type EditableField = "position" | "company" | "salary" | "interview";

const INTERVIEW_STAGES: Stage[] = ["INTERVIEW_REQUEST", "INTERVIEW_STAGE", "WAITING_INTERVIEW_RESULTS"];

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
    // Transparent box matching cellInputClass so display text lines up with the input cells beside it, instead of sitting flush at the top edge while bordered inputs sit inset.
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
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [pendingEdits, setPendingEdits] = useState<Record<number, Partial<JobSummary>>>({});
  // Per-row (not a single id) so a fast save on row A finishing doesn't clear the "Saving…" state of a still-saving row B.
  const [savingJobIds, setSavingJobIds] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<{ jobId: number; field: EditableField } | null>(null);
  const [interviewModalMode, setInterviewModalMode] = useState<InterviewFormMode | null>(null);
  const [detailModalJob, setDetailModalJob] = useState<JobSummary | null>(null);

  // Cells are memoized once so typing doesn't remount every input; they read the latest values through these refs instead of closing over the state directly.
  const pendingEditsRef = useRef(pendingEdits);
  pendingEditsRef.current = pendingEdits;
  const editingCellRef = useRef(editingCell);
  editingCellRef.current = editingCell;
  const savingJobIdsRef = useRef(savingJobIds);
  savingJobIdsRef.current = savingJobIds;
  const jobsRef = useRef(jobs);
  jobsRef.current = jobs;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const onDeletedRef = useRef(onDeleted);
  onDeletedRef.current = onDeleted;

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

  // Autosave commit point: saves the full row (job + pending draft + overrides), used by dropdowns (on change) and pencil fields (on Done).
  async function saveRow(jobId: number, overrides: Partial<JobSummary> = {}) {
    const original = jobsRef.current.find(j => j.id === jobId);
    if (!original) return;
    const merged = { ...original, ...pendingEditsRef.current[jobId], ...overrides };
    setSavingJobIds(prev => new Set(prev).add(jobId));
    setError(null);
    try {
      await updateJob(jobId, toUpdateJobInput(merged));
      // Only drop keys whose value still matches what we saved; a field edited again mid-save has a newer value and must survive.
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
      setSavingJobIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }

  function handleDoneEditing(jobId: number) {
    setEditingCell(null);
    if (pendingEditsRef.current[jobId]) {
      saveRow(jobId);
    }
  }

  function openInterviewEditor(jobId: number) {
    setEditingCell({ jobId, field: "interview" });
  }

  function cancelInterviewEditor() {
    setEditingCell(null);
  }

  // Always creates a new round, never updates: `latestInterview` can point at an older StageEvent (a Stage-dropdown change makes a fresh one), so guessing update-vs-create risks overwriting a past round. Editing existing rounds is the calendar's job. A blank date means the user saved an empty editor, so just close it.
  async function saveInterview(jobId: number, draft: InlineInterviewDraft) {
    if (!draft.interviewDateTime) {
      cancelInterviewEditor();
      return;
    }
    const job = jobsRef.current.find(j => j.id === jobId);
    if (!job) return;

    setSavingJobIds(prev => new Set(prev).add(jobId));
    setError(null);
    try {
      await createInterview({
        jobId,
        stage: effective(job, pendingEditsRef.current, "currentStage"),
        interviewDateTime: new Date(draft.interviewDateTime).toISOString(),
        interviewType: draft.interviewType || undefined,
        meetingLink: draft.meetingLink || undefined,
        location: draft.location || undefined,
        interviewers: draft.interviewers,
      });
      cancelInterviewEditor();
      onSavedRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save interview");
    } finally {
      setSavingJobIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }

  async function handleDeleteInterview(jobId: number, stageEventId: number) {
    if (!window.confirm("Delete this interview permanently?")) return;
    setSavingJobIds(prev => new Set(prev).add(jobId));
    setError(null);
    try {
      await deleteInterview(stageEventId);
      onSavedRef.current();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete interview");
    } finally {
      setSavingJobIds(prev => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });
    }
  }

  // The table holds only the compact latestInterview summary; assemble the full Interview the modal needs from it plus job fields, no extra fetch.
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const columns = useMemo<ColumnDef<JobSummary, any>[]>(() => [
    columnHelper.accessor("company", {
      header: "Company",
      filterFn: listFilter,
      meta: { filter: "list" },
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
      filterFn: listFilter,
      meta: { filter: "list" },
      size: 220,
      minSize: 140,
      cell: info => {
        const job = info.row.original;
        const roleVal = effective(job, pendingEditsRef.current, "role");
        const urlVal = effective(job, pendingEditsRef.current, "url");
        const safeUrl = safeHref(urlVal);
        return (
          <EditToggleCell
            isEditing={isEditingField(job.id, "position")}
            onStartEdit={() => setEditingCell({ jobId: job.id, field: "position" })}
            onDone={() => handleDoneEditing(job.id)}
            editLabel={`Edit position for ${job.company}`}
            display={
              safeUrl ? (
                <a
                  href={safeUrl}
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
      filterFn: listFilter,
      meta: { filter: "list", optionLabels: SOURCE_CATEGORY_LABELS },
      size: 165,
      minSize: 130,
      cell: info => {
        const job = info.row.original;
        return (
          <select
            aria-label="Application"
            className={cellInputClass}
            disabled={savingJobIdsRef.current.has(job.id)}
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
      filterFn: listFilter,
      meta: { filter: "list", optionLabels: LOCATION_LABELS },
      size: 150,
      minSize: 110,
      cell: info => {
        const job = info.row.original;
        const value = effective(job, pendingEditsRef.current, "location") ?? "";
        return (
          <select
            aria-label="Location"
            className={cellInputClass}
            disabled={savingJobIdsRef.current.has(job.id)}
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
      filterFn: salaryFilter,
      meta: { filter: "salary" },
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
      filterFn: listFilter,
      meta: { filter: "list", optionLabels: STAGE_LABELS },
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
              disabled={savingJobIdsRef.current.has(job.id)}
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
              <InlineInterviewEditor
                inputClass={cellInputClass}
                onSave={draft => saveInterview(job.id, draft)}
                onCancel={cancelInterviewEditor}
              />
            )}
          </div>
        );
      },
    }),
    columnHelper.accessor("outcome", {
      header: "Outcome",
      filterFn: listFilter,
      meta: { filter: "list", optionLabels: OUTCOME_LABELS },
      size: 150,
      minSize: 110,
      cell: info => {
        const job = info.row.original;
        return (
          <select
            aria-label="Outcome"
            className={cellInputClass}
            disabled={savingJobIdsRef.current.has(job.id)}
            value={effective(job, pendingEditsRef.current, "outcome")}
            onChange={e => {
              const value = e.target.value as Outcome;
              const overrides: Partial<JobSummary> = { outcome: value };
              // A rejected job is closed, so move it straight to the terminal stage.
              if (value === "REJECTED") {
                overrides.currentStage = "FINALIZED";
                setField(job.id, "currentStage", "FINALIZED");
              }
              setField(job.id, "outcome", value);
              saveRow(job.id, overrides);
              // Rejected reason lives in the Details modal, so open it so it doesn't get left blank.
              if (value === "REJECTED") {
                setDetailModalJob({ ...job, ...overrides });
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
        if (savingJobIdsRef.current.has(job.id)) {
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
    state: { sorting, columnFilters },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  return (
    <div className="flex h-full min-w-0 flex-col">
      {error && <p role="alert" className="mb-2 shrink-0 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {columnFilters.length > 0 && (
        <div className="mb-2 flex shrink-0 items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          <span>Showing {table.getRowModel().rows.length} of {defaultOrderedJobs.length}</span>
          <button
            type="button"
            onClick={() => setColumnFilters([])}
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            Clear filters
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <table
          style={{ width: "100%", minWidth: table.getTotalSize() }}
          className="table-fixed border-separate border-spacing-0 text-sm"
        >
          <thead>
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="sticky top-0 z-10 border-b border-neutral-300 bg-neutral-100 px-2 py-2 text-center font-medium text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                  >
                    <div className="relative flex items-center justify-center px-4">
                      <div
                        role={header.column.getCanSort() ? "button" : undefined}
                        tabIndex={header.column.getCanSort() ? 0 : undefined}
                        className="cursor-pointer select-none truncate text-center"
                        onClick={header.column.getToggleSortingHandler()}
                        onKeyDown={e => {
                          if (header.column.getCanSort() && (e.key === "Enter" || e.key === " ")) {
                            e.preventDefault();
                            header.column.toggleSorting();
                          }
                        }}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" && " ▲"}
                        {header.column.getIsSorted() === "desc" && " ▼"}
                      </div>
                      {header.column.getCanFilter() && (
                        <span className="absolute right-1.5">
                          <ColumnFilterPopover column={header.column} />
                        </span>
                      )}
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
              const color = rowColor(merged);
              return (
                <tr key={row.id} className={ROW_BG_CLASS[color]}>
                  {row.getVisibleCells().map((cell, cellIndex) => (
                    <td
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className={`border-b border-neutral-200 px-2 py-1 align-top dark:border-neutral-800 ${cellIndex === 0 ? ROW_ACCENT_CLASS[color] : ""}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td
                  colSpan={table.getAllLeafColumns().length}
                  className="px-2 py-6 text-center text-sm text-neutral-500 dark:text-neutral-400"
                >
                  No jobs match your filters.
                </td>
              </tr>
            )}
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
