import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { Column } from "@tanstack/react-table";
import type { JobSummary } from "../api/jobsApi";

const panelInputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm font-normal text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";

export interface ColumnFilterMeta {
  filter: "list" | "salary";
  // For enum columns, maps the stored value to a human label shown in the checklist.
  optionLabels?: Record<string, string>;
}

function columnLabel(column: Column<JobSummary, unknown>): string {
  return typeof column.columnDef.header === "string" ? column.columnDef.header : column.id;
}

function FunnelIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={`h-3.5 w-3.5 ${active ? "" : "opacity-80"}`}>
      <path d="M2 3h12l-4.6 5.6v4.1l-2.8 1.4V8.6L2 3Z" />
    </svg>
  );
}

export function ColumnFilterPopover({ column }: { column: Column<JobSummary, unknown> }) {
  const meta = column.columnDef.meta as ColumnFilterMeta | undefined;
  const btnRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  if (!meta) return null;
  const active = column.getIsFiltered();

  function openPanel(e: MouseEvent) {
    e.stopPropagation(); // don't trigger the header's sort toggle
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 240) });
    setOpen(true);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={`Filter by ${columnLabel(column)}`}
        onClick={openPanel}
        className={`shrink-0 rounded p-0.5 ${active ? "text-blue-600 dark:text-blue-400" : "text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"}`}
      >
        <FunnelIcon active={active} />
      </button>
      {open && pos && <FilterPanel column={column} meta={meta} pos={pos} onClose={() => setOpen(false)} />}
    </>
  );
}

interface FilterPanelProps {
  column: Column<JobSummary, unknown>;
  meta: ColumnFilterMeta;
  pos: { top: number; left: number };
  onClose: () => void;
}

function FilterPanel({ column, meta, pos, onClose }: FilterPanelProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDocMouseDown(e: globalThis.MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [onClose]);

  return (
    <div
      ref={ref}
      style={{ position: "fixed", top: pos.top, left: pos.left, width: 240 }}
      className="z-50 rounded border border-neutral-300 bg-white p-2 text-left font-normal shadow-lg dark:border-neutral-600 dark:bg-neutral-800"
    >
      {meta.filter === "salary"
        ? <SalaryFilterBody column={column} onClose={onClose} />
        : <ListFilterBody column={column} meta={meta} onClose={onClose} />}
    </div>
  );
}

function ListFilterBody({ column, meta, onClose }: { column: Column<JobSummary, unknown>; meta: ColumnFilterMeta; onClose: () => void }) {
  const keys = Array.from(column.getFacetedUniqueValues().keys());
  const labelFor = (v: unknown) => (v == null ? "Not set" : meta.optionLabels?.[String(v)] ?? String(v));
  const options = keys.map(v => ({ value: v, label: labelFor(v) })).sort((a, b) => a.label.localeCompare(b.label));
  const current = column.getFilterValue();
  const [selected, setSelected] = useState<Set<unknown>>(() => (Array.isArray(current) ? new Set(current) : new Set(keys)));
  const [search, setSearch] = useState("");
  const [touched, setTouched] = useState(false);
  const visible = options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()));

  function toggle(v: unknown) {
    setTouched(true);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  }
  function apply() {
    // Typed a search but never touched a checkbox: OK filters to the matches. Otherwise apply the checked set (all checked = no filter, none = no rows).
    const chosen = search.trim() && !touched ? visible.map(o => o.value) : keys.filter(k => selected.has(k));
    column.setFilterValue(chosen.length === keys.length ? undefined : chosen);
    onClose();
  }

  return (
    <div className="flex flex-col gap-2">
      <input autoFocus placeholder="Search" className={panelInputClass} value={search} onChange={e => setSearch(e.target.value)} />
      <div className="flex justify-between px-0.5 text-xs">
        <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => { setTouched(true); setSelected(new Set(keys)); }}>Select all</button>
        <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => { setTouched(true); setSelected(new Set()); }}>Clear</button>
      </div>
      <div className="max-h-48 overflow-auto">
        {visible.map(o => (
          <label key={String(o.value)} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700">
            <input type="checkbox" checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
            <span className="truncate">{o.label}</span>
          </label>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-neutral-200 pt-2 text-sm dark:border-neutral-700">
        <button type="button" className="rounded border border-neutral-300 px-3 py-1 dark:border-neutral-600" onClick={onClose}>Cancel</button>
        <button type="button" className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700" onClick={apply}>OK</button>
      </div>
    </div>
  );
}

function SalaryFilterBody({ column, onClose }: { column: Column<JobSummary, unknown>; onClose: () => void }) {
  const current = column.getFilterValue();
  const [min, setMin] = useState<string>(typeof current === "string" ? current : "");
  function apply() {
    column.setFilterValue(min || undefined);
    onClose();
  }
  return (
    <div className="flex flex-col gap-2">
      <input autoFocus type="number" placeholder="Min salary" className={panelInputClass} value={min} onChange={e => setMin(e.target.value)} />
      <div className="flex justify-end gap-2 text-sm">
        <button type="button" className="rounded border border-neutral-300 px-3 py-1 dark:border-neutral-600" onClick={onClose}>Cancel</button>
        <button type="button" className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700" onClick={apply}>OK</button>
      </div>
    </div>
  );
}
