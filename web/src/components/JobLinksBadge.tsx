import { useEffect, useRef, useState, type MouseEvent } from "react";
import { JOB_RELATION_LABELS, type JobLink } from "../api/jobsApi";

export interface JobLinksBadgeProps {
  links: JobLink[];
  onJump: (jobId: number) => void;
}

const PANEL_WIDTH = 260;

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      className="h-3.5 w-3.5"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export default function JobLinksBadge({ links, onJump }: JobLinksBadgeProps) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  if (links.length === 0) return null;

  function openPanel(e: MouseEvent) {
    // The cell turns into an editor on click; keep the event here.
    e.stopPropagation();
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.bottom + 6, left: Math.max(8, rect.left) });
  }

  // Count lives in the tooltip: the panel lists them, so a digit per row adds nothing.
  const label = `${links.length} linked job${links.length === 1 ? "" : "s"}`;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-label={label}
        title={label}
        onClick={openPanel}
        className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-200 hover:text-blue-600 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-blue-400"
      >
        <LinkIcon />
      </button>
      {pos && <LinksPanel links={links} pos={pos} onJump={onJump} onClose={() => setPos(null)} />}
    </>
  );
}

interface LinksPanelProps {
  links: JobLink[];
  pos: { top: number; left: number };
  onJump: (jobId: number) => void;
  onClose: () => void;
}

function LinksPanel({ links, pos, onJump, onClose }: LinksPanelProps) {
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
      style={{ position: "fixed", top: pos.top, left: pos.left, width: PANEL_WIDTH }}
      className="z-50 rounded border border-neutral-300 bg-white p-1 text-left font-normal shadow-lg dark:border-neutral-600 dark:bg-neutral-800"
    >
      {links.map(link => (
        <button
          key={link.jobId}
          type="button"
          onClick={() => {
            onJump(link.jobId);
            onClose();
          }}
          className="block w-full rounded px-2 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-700"
          title={`${link.company} — ${link.role}`}
        >
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            {JOB_RELATION_LABELS[link.relation]}
          </span>
          <span className="block truncate text-sm text-blue-600 dark:text-blue-400">
            {link.company} — {link.role}
          </span>
        </button>
      ))}
    </div>
  );
}
