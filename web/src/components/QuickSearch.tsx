import { useState, type KeyboardEvent } from "react";
import Modal from "./Modal";
import { OUTCOME_LABELS, type JobSummary } from "../api/jobsApi";

export interface QuickSearchProps {
  open: boolean;
  jobs: JobSummary[];
  onClose: () => void;
  onPick: (job: JobSummary) => void;
}

const MAX_RESULTS = 8;

// Every word has to appear somewhere in the company, role, or city, so "acme back" finds Acme's backend role.
function matches(job: JobSummary, query: string): boolean {
  const haystack = `${job.company} ${job.role} ${job.city ?? ""}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
}

// Find a job by typing instead of hunting through columns and pages.
export default function QuickSearch({ open, jobs, onClose, onPick }: QuickSearchProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const results = query.trim() ? jobs.filter(job => matches(job, query)).slice(0, MAX_RESULTS) : [];

  function close() {
    setQuery("");
    setSelected(0);
    onClose();
  }

  function pick(job: JobSummary) {
    close();
    onPick(job);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const step = e.key === "ArrowDown" ? 1 : -1;
      setSelected(current => (current + step + results.length) % Math.max(results.length, 1));
    } else if (e.key === "Enter" && results[selected]) {
      e.preventDefault();
      pick(results[selected]);
    }
  }

  return (
    <Modal open={open} onClose={close} title="Find a job">
      <input
        aria-label="Search jobs"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="quick-search-results"
        aria-activedescendant={results[selected] ? `quick-search-${results[selected].id}` : undefined}
        autoFocus
        value={query}
        onChange={e => { setQuery(e.target.value); setSelected(0); }}
        onKeyDown={handleKeyDown}
        placeholder="Company, role, or city"
        className="w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      {query.trim() && results.length === 0 && (
        <p className="mt-3 text-sm text-neutral-500 dark:text-neutral-400">No job matches that.</p>
      )}
      <ul id="quick-search-results" role="listbox" aria-label="Matching jobs" className="mt-2 space-y-1">
        {results.map((job, i) => (
          <li
            key={job.id}
            id={`quick-search-${job.id}`}
            role="option"
            aria-selected={i === selected}
            onMouseEnter={() => setSelected(i)}
            onClick={() => pick(job)}
            className={`cursor-pointer rounded px-3 py-2 text-sm ${i === selected ? "bg-blue-600 text-white" : "hover:bg-neutral-100 dark:hover:bg-neutral-800"}`}
          >
            <span className="font-medium">{job.company}</span>, {job.role}
            {job.outcome !== "ACTIVE" && <span className="opacity-75"> · {OUTCOME_LABELS[job.outcome]}</span>}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-neutral-500 dark:text-neutral-400">Arrow keys to choose, Enter to open.</p>
    </Modal>
  );
}
