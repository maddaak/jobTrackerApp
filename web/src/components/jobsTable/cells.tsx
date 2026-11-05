import { Link } from "react-router-dom";
import type { CellContext } from "@tanstack/react-table";
import {
  LOCATIONS,
  SOURCE_CATEGORIES,
  SOURCE_CATEGORY_LABELS,
  type JobSummary,
  type Location,
  type SourceCategory,
  type UpdateJobInput,
} from "../../api/jobsApi";
import { INTERVIEW_TYPE_LABELS } from "../../api/interviewsApi";
import { hasStage, isInterviewing } from "../../jobPlacement";
import { formatDateTimeRange } from "../../interviewTimes";
import { safeHref } from "../../safeHref";
import JobLinksBadge from "../JobLinksBadge";
import { StageSelect, StatusSelect, WaitingOnResults } from "../job/StatusPickers";
import EditToggleCell from "./EditToggleCell";
import { useJobsTable } from "./useRowEditing";

type Cell = CellContext<JobSummary, unknown>;

// Always-visible border so every field in a multi-input editor looks editable, not just the focused one.
const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-1.5 py-1 text-sm text-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:border-neutral-200 disabled:bg-neutral-100 disabled:text-neutral-400 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100 dark:disabled:border-neutral-700 dark:disabled:bg-neutral-800 dark:disabled:text-neutral-500";
const linkClass = "text-blue-600 hover:underline dark:text-blue-400";
const quietClass = "block border border-transparent px-1.5 py-1 text-sm text-neutral-500 dark:text-neutral-400";

export function CompanyCell({ row }: Cell) {
  const { editing, jumpToJob } = useJobsTable();
  const job = editing.rowOf(row.original);
  return (
    <EditToggleCell
      isEditing={editing.isEditing(job.id, "company")}
      onStartEdit={() => editing.startEditing(job.id, "company")}
      onDone={() => editing.finishEditing(job.id)}
      editLabel={`Edit company for ${row.original.company}`}
      display={
        <span className="flex items-center gap-1.5">
          <span className="truncate" title={job.company}>{job.company}</span>
          <JobLinksBadge links={job.links} onJump={jumpToJob} />
        </span>
      }
      editor={
        <input
          aria-label="Company"
          autoFocus
          className={inputClass}
          value={job.company}
          onChange={e => editing.setField(job.id, "company", e.target.value)}
        />
      }
    />
  );
}

export function PositionCell({ row }: Cell) {
  const { editing } = useJobsTable();
  const job = editing.rowOf(row.original);
  const href = safeHref(job.url);
  return (
    <EditToggleCell
      isEditing={editing.isEditing(job.id, "position")}
      onStartEdit={() => editing.startEditing(job.id, "position")}
      onDone={() => editing.finishEditing(job.id)}
      editLabel={`Edit position for ${row.original.company}`}
      display={
        href ? (
          <a href={href} target="_blank" rel="noreferrer" title={job.role} className={`block truncate ${linkClass}`}>
            {job.role}
          </a>
        ) : (
          <span className="block truncate" title={job.role}>{job.role}</span>
        )
      }
      editor={
        <div className="flex flex-col gap-1">
          <input
            aria-label="Role"
            autoFocus
            className={inputClass}
            value={job.role}
            placeholder="Role"
            onChange={e => editing.setField(job.id, "role", e.target.value)}
          />
          <input
            aria-label="Position URL"
            className={inputClass}
            value={job.url ?? ""}
            placeholder="URL"
            onChange={e => editing.setField(job.id, "url", e.target.value)}
          />
        </div>
      }
    />
  );
}

export function ApplicationCell({ row }: Cell) {
  const { editing } = useJobsTable();
  const job = editing.rowOf(row.original);
  return (
    <select
      aria-label="Application"
      className={inputClass}
      disabled={editing.isSaving(job.id)}
      value={job.sourceCategory}
      onChange={e => editing.save(job.id, { sourceCategory: e.target.value as SourceCategory })}
    >
      {SOURCE_CATEGORIES.map(category => (
        <option key={category} value={category}>{SOURCE_CATEGORY_LABELS[category]}</option>
      ))}
    </select>
  );
}

export function LocationCell({ row }: Cell) {
  const { editing } = useJobsTable();
  const job = editing.rowOf(row.original);
  return (
    <select
      aria-label="Location"
      className={inputClass}
      disabled={editing.isSaving(job.id)}
      value={job.location ?? ""}
      onChange={e => editing.save(job.id, { location: (e.target.value || null) as Location | null })}
    >
      <option value="">Not set</option>
      {LOCATIONS.map(location => (
        <option key={location.value} value={location.value}>{location.label}</option>
      ))}
    </select>
  );
}

export function CityCell({ row }: Cell) {
  const { editing } = useJobsTable();
  const job = editing.rowOf(row.original);
  return (
    <EditToggleCell
      isEditing={editing.isEditing(job.id, "city")}
      onStartEdit={() => editing.startEditing(job.id, "city")}
      onDone={() => editing.finishEditing(job.id)}
      editLabel={`Edit city for ${row.original.company}`}
      display={<span className="block truncate" title={job.city ?? undefined}>{job.city || "—"}</span>}
      editor={
        <input
          aria-label="City"
          autoFocus
          maxLength={100}
          className={inputClass}
          value={job.city ?? ""}
          onChange={e => editing.setField(job.id, "city", e.target.value || null)}
        />
      }
    />
  );
}

export function SalaryCell({ row }: Cell) {
  const { editing } = useJobsTable();
  const job = editing.rowOf(row.original);
  const { compMin: min, compMax: max } = job;
  const display = min != null || max != null
    ? `${min != null ? min.toLocaleString() : "?"} – ${max != null ? max.toLocaleString() : "?"}`
    : "—";
  const toNumber = (value: string) => (value ? Number(value) : null);
  return (
    <EditToggleCell
      isEditing={editing.isEditing(job.id, "salary")}
      onStartEdit={() => editing.startEditing(job.id, "salary")}
      onDone={() => editing.finishEditing(job.id)}
      editLabel={`Edit salary for ${row.original.company}`}
      display={<span className="block truncate">{display}</span>}
      editor={
        <div className="flex gap-1">
          <input
            aria-label="Comp min"
            autoFocus
            type="number"
            className={inputClass}
            value={min ?? ""}
            onChange={e => editing.setField(job.id, "compMin", toNumber(e.target.value))}
          />
          <input
            aria-label="Comp max"
            type="number"
            className={inputClass}
            value={max ?? ""}
            onChange={e => editing.setField(job.id, "compMax", toNumber(e.target.value))}
          />
        </div>
      }
    />
  );
}

// The same Stage picker as the job dialog, plus the job's rounds, since that's where the table tracks them.
export function StageCell({ row }: Cell) {
  const { editing, addInterview, openLatestRound } = useJobsTable();
  const job = editing.rowOf(row.original);
  if (!hasStage(job)) {
    return <span className={quietClass}>Done</span>;
  }
  const picker = {
    job,
    disabled: editing.isSaving(job.id),
    onChange: (input: UpdateJobInput) => editing.save(job.id, input),
  };
  const round = job.latestInterview;
  return (
    <div className="flex flex-col gap-1">
      <StageSelect {...picker} className={inputClass} />
      <WaitingOnResults {...picker} className="flex items-center gap-1.5 text-xs" />
      {(isInterviewing(job) || job.currentStage === "INTERVIEW_REQUEST") && (
        <div className="flex flex-col items-start gap-0.5 text-xs">
          {round && (
            <button
              type="button"
              onClick={() => openLatestRound(job)}
              className="text-left text-neutral-500 hover:text-blue-600 hover:underline dark:text-neutral-400 dark:hover:text-blue-400"
            >
              {round.roundCount > 1 && `${round.roundCount} rounds · latest `}
              {formatDateTimeRange(round.interviewDateTime, round.interviewEndDateTime)}
              {round.interviewType && ` · ${INTERVIEW_TYPE_LABELS[round.interviewType]}`}
            </button>
          )}
          {round && round.roundCount > 1 && (
            <Link to="/calendar" className={linkClass}>See all rounds on calendar</Link>
          )}
          <button type="button" onClick={() => addInterview(job.id)} className={linkClass}>
            + Add interview
          </button>
        </div>
      )}
    </div>
  );
}

export function StatusCell({ row }: Cell) {
  const { editing, openDetails } = useJobsTable();
  const job = editing.rowOf(row.original);
  return (
    <StatusSelect
      job={job}
      disabled={editing.isSaving(job.id)}
      className={inputClass}
      onChange={input => {
        editing.save(job.id, input);
        // Opened for the rejected reason, which would otherwise be left blank.
        if (input.outcome === "REJECTED") openDetails(job.id);
      }}
    />
  );
}

export function ActionsCell({ row }: Cell) {
  const { editing, openDetails } = useJobsTable();
  const job = row.original;
  if (editing.isSaving(job.id)) {
    return <span className={`${quietClass} text-xs`}>Saving…</span>;
  }
  return (
    <div className="flex items-center justify-between gap-2 border border-transparent px-1.5 py-1">
      <button type="button" onClick={() => openDetails(job.id)} className={linkClass}>
        Details
      </button>
      <button
        type="button"
        aria-label={`Delete ${job.company} ${job.role}`}
        className="text-lg leading-none text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
        onClick={() => editing.remove(job)}
      >
        ✕
      </button>
    </div>
  );
}
