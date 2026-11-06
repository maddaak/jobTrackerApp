import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnFiltersState,
  type SortingState,
} from "@tanstack/react-table";
import { rowColor, type JobSummary, type RowColor } from "../../api/jobsApi";
import InterviewFormModal, { type InterviewFormMode } from "../InterviewFormModal";
import JobDetailModal from "../JobDetailModal";
import { ColumnFilterPopover } from "./JobsTableFilters";
import SavedFilters from "./SavedFilters";
import { JOBS_TABLE_COLUMNS } from "./columns";
import { JobsTableContext, useRowEditing, type JobsTableActions } from "./useRowEditing";

const ROW_BG_CLASS: Record<RowColor, string> = {
  red: "bg-red-50 dark:bg-red-950/20",
  green: "bg-green-50 dark:bg-green-950/20",
  yellow: "bg-yellow-50 dark:bg-yellow-950/20",
  sky: "bg-sky-50 dark:bg-sky-950/30",
  indigo: "bg-indigo-50 dark:bg-indigo-950/30",
};

// Accent on the first cell, not the row: row borders don't render in the border-separate model the sticky header needs.
const ROW_ACCENT_CLASS: Record<RowColor, string> = {
  red: "border-l-4 border-l-red-400 dark:border-l-red-500",
  green: "border-l-4 border-l-green-400 dark:border-l-green-500",
  yellow: "border-l-4 border-l-yellow-400 dark:border-l-yellow-500",
  sky: "border-l-4 border-l-sky-400 dark:border-l-sky-500",
  indigo: "border-l-4 border-l-indigo-400 dark:border-l-indigo-500",
};

export interface JobsTableProps {
  jobs: JobSummary[];
  onSaved: () => void | Promise<void>;
  onDeleted: () => void;
  // Controls above the table, given the jobs it shows after filters and sorting, such as a download.
  toolbar?: (shown: JobSummary[]) => ReactNode;
}

export default function JobsTable({ jobs, onSaved, onDeleted, toolbar }: JobsTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [interviewModalMode, setInterviewModalMode] = useState<InterviewFormMode | null>(null);
  // The id, not a copy: the modal's controls must see each save, or the next one PATCHes a stale record.
  const [detailJobId, setDetailJobId] = useState<number | null>(null);
  // Carries the click that set it, so jumping to the same row again restarts the flash.
  const [flash, setFlash] = useState<{ jobId: number; jump: number } | null>(null);
  const rowRefs = useRef(new Map<number, HTMLTableRowElement>());
  const editing = useRowEditing(jobs, onSaved, onDeleted);

  const oldestFirst = useMemo(() => [...jobs].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [jobs]);

  useEffect(() => {
    if (flash === null) return;
    const timer = setTimeout(() => setFlash(null), 1600);
    return () => clearTimeout(timer);
  }, [flash]);

  const actions: JobsTableActions = {
    editing,
    openDetails: setDetailJobId,
    addInterview: jobId => setInterviewModalMode({ kind: "create", jobId }),
    // Built from the summary the row already has, so opening it costs no fetch.
    openLatestRound: job => {
      if (!job.latestInterview) return;
      setInterviewModalMode({
        kind: "edit",
        interview: {
          ...job.latestInterview, jobId: job.id, company: job.company, role: job.role, stage: job.currentStage, aiResults: {},
        },
      });
    },
    jumpToJob: jobId => {
      const row = rowRefs.current.get(jobId);
      // A filter can hide the target; scrolling to nothing looks broken.
      if (!row) {
        editing.setError("that linked job is hidden by the current filters");
        return;
      }
      editing.setError(null);
      row.scrollIntoView({ block: "center", behavior: "smooth" });
      setFlash(prev => ({ jobId, jump: (prev?.jump ?? 0) + 1 }));
    },
  };

  const table = useReactTable({
    data: oldestFirst,
    columns: JOBS_TABLE_COLUMNS,
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
  const rows = table.getRowModel().rows;

  function closeInterviewModal(changed: boolean) {
    setInterviewModalMode(null);
    if (changed) onSaved();
  }

  return (
    <JobsTableContext.Provider value={actions}>
      <div className="flex h-full min-w-0 flex-col">
        {toolbar?.(rows.map(row => row.original))}
        {editing.error && <p role="alert" className="mb-2 shrink-0 text-sm text-red-600 dark:text-red-400">{editing.error}</p>}
        <SavedFilters current={columnFilters} onApply={setColumnFilters} />
        {columnFilters.length > 0 && (
          <div className="mb-2 flex shrink-0 items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <span>Showing {rows.length} of {oldestFirst.length}</span>
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
              {rows.map(row => {
                const job = row.original;
                const color = rowColor(editing.rowOf(job));
                return (
                  <tr
                    key={row.id}
                    ref={el => {
                      if (el) rowRefs.current.set(job.id, el);
                      else rowRefs.current.delete(job.id);
                    }}
                    className={ROW_BG_CLASS[color]}
                  >
                    {row.getVisibleCells().map((cell, cellIndex) => (
                      <td
                        key={cell.id}
                        style={{ width: cell.column.getSize() }}
                        // Flash on the cells, not the row: border-separate drops row-level styling.
                        className={`border-b border-neutral-200 px-2 py-1 align-top dark:border-neutral-800 ${cellIndex === 0 ? ROW_ACCENT_CLASS[color] : ""} ${
                          flash?.jobId === job.id ? "bg-blue-200 dark:bg-blue-800/60" : ""
                        }`}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {rows.length === 0 && (
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
          onClose={() => closeInterviewModal(false)}
          onSaved={() => closeInterviewModal(true)}
          onDeleted={() => closeInterviewModal(true)}
        />
        <JobDetailModal
          job={jobs.find(job => job.id === detailJobId) ?? null}
          allJobs={jobs}
          onClose={() => setDetailJobId(null)}
          onSaved={onSaved}
        />
      </div>
    </JobsTableContext.Provider>
  );
}
