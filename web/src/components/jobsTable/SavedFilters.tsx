import { useState, type FormEvent } from "react";
import type { ColumnFiltersState } from "@tanstack/react-table";

interface SavedFilter {
  name: string;
  filters: ColumnFiltersState;
}

const STORAGE_KEY = "jobTracker.savedFilters";

// This browser only: a convenience like a remembered sort, not part of the job search a backup carries.
function load(): SavedFilter[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as SavedFilter[] : [];
  } catch {
    return [];
  }
}

function store(saved: SavedFilter[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  } catch {
    // Private windows can refuse storage; the filter still applies for now.
  }
}

export interface SavedFiltersProps {
  current: ColumnFiltersState;
  onApply: (filters: ColumnFiltersState) => void;
}

// Named views such as "remote, over $150k, still active", one click away instead of rebuilt column by column.
export default function SavedFilters({ current, onApply }: SavedFiltersProps) {
  const [saved, setSaved] = useState<SavedFilter[]>(load);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  function update(next: SavedFilter[]) {
    setSaved(next);
    store(next);
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    // Saving under an existing name replaces it, so a view can be refined in place.
    update([...saved.filter(view => view.name !== trimmed), { name: trimmed, filters: current }]);
    setName("");
    setNaming(false);
  }

  if (saved.length === 0 && current.length === 0) return null;

  return (
    <div className="mb-2 flex shrink-0 flex-wrap items-center gap-2 text-xs">
      {saved.map(view => (
        <span key={view.name} className="inline-flex items-center rounded-full border border-neutral-300 dark:border-neutral-600">
          <button type="button" onClick={() => onApply(view.filters)} className="rounded-l-full px-2.5 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-800">
            {view.name}
          </button>
          <button
            type="button"
            aria-label={`Forget the ${view.name} view`}
            onClick={() => update(saved.filter(other => other.name !== view.name))}
            className="rounded-r-full px-1.5 py-0.5 text-neutral-400 hover:text-red-600"
          >
            ×
          </button>
        </span>
      ))}
      {current.length > 0 && !naming && (
        <button type="button" onClick={() => setNaming(true)} className="text-blue-600 hover:underline dark:text-blue-400">
          Save these filters
        </button>
      )}
      {naming && (
        <form onSubmit={handleSave} className="inline-flex items-center gap-1">
          <input
            aria-label="Name for these filters"
            autoFocus
            required
            maxLength={40}
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Remote, still active"
            className="rounded border border-neutral-300 px-2 py-0.5 dark:border-neutral-600 dark:bg-neutral-900"
          />
          <button type="submit" disabled={!name.trim()} className="rounded bg-blue-600 px-2 py-0.5 font-medium text-white disabled:opacity-50">Save</button>
          <button type="button" onClick={() => setNaming(false)} className="px-1 text-neutral-500">Cancel</button>
        </form>
      )}
    </div>
  );
}
