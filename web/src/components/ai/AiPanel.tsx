import { useState, type ReactNode } from "react";
import type { AiResult, AssistOutcome, Researched } from "../../api/aiApi";
import { safeHref } from "../../safeHref";

export interface AiPanelProps<T> {
  title: string;
  // Shown until the first run: what it does, and that it's billed.
  about: string;
  runLabel: string;
  busyLabel: string;
  result: AiResult<T> | null;
  run: () => Promise<AssistOutcome<T>>;
  remove: () => Promise<void>;
  onChange: (result: AiResult<T> | null) => void;
  children: (content: T) => ReactNode;
  // Shown above the run button, such as the notes a debrief is made from.
  inputs?: ReactNode;
  // Beside the title even when collapsed, for a choice that picks which saved answer is shown.
  controls?: ReactNode;
  canRun?: boolean;
  // Why a saved answer no longer matches, such as jobs added since.
  staleNote?: string | null;
}

export const linkClass = "text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400";
const headingClass = "text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400";

export function TitledList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className={headingClass}>{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5">
        {items.map((item, i) => <li key={`${i}:${item}`}>{item}</li>)}
      </ul>
    </div>
  );
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access (an insecure origin or a denied permission): the text is on screen to select.
    }
  }
  return (
    <button type="button" onClick={copy} className={`${linkClass} text-xs`}>
      {copied ? "Copied" : label}
    </button>
  );
}

// Only the answers that can search the web carry these, so their sources show without each panel asking.
function isResearched(content: unknown): content is Researched {
  return typeof (content as Partial<Researched> | null)?.searched === "boolean";
}

function Sources({ researched }: { researched: Researched }) {
  return (
    <div className="space-y-1">
      {researched.sources.length > 0 && (
        <>
          <p className={headingClass}>Sources</p>
          <ul className="space-y-0.5">
            {researched.sources.map(source => {
              const href = safeHref(source.url);
              return (
                <li key={source.url} className="truncate">
                  {href
                    ? <a href={href} target="_blank" rel="noreferrer" title={source.url} className={linkClass}>{source.title || source.url} ↗</a>
                    : source.title || source.url}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {researched.searched
          ? "Researched on the web"
          : "From the AI model's general knowledge, with no live sources: it may be out of date"}
      </p>
    </div>
  );
}

// Every AI feature is a button whose answer is saved, so it's shown again for free and only rerun on request.
// Collapsed when loaded, so a page holding several stays a glance; open right after a run.
export default function AiPanel<T>({
  title, about, runLabel, busyLabel, result, run, remove, onChange, children, inputs, controls, canRun = true, staleNote,
}: AiPanelProps<T>) {
  const [busy, setBusy] = useState<"running" | "removing" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function handleRun() {
    setBusy("running");
    setProblem(null);
    try {
      const outcome = await run();
      if (outcome.status === "ok") {
        onChange(outcome.result);
        setExpanded(true);
      } else if (outcome.status === "not_configured") {
        setProblem("No AI provider is set up.");
      } else {
        setProblem("The AI is unavailable right now. Try again in a moment.");
      }
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "the AI call failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleRemove() {
    if (!window.confirm(`Remove this ${title.toLowerCase()}? Running it again is billed by your AI provider.`)) return;
    setBusy("removing");
    setProblem(null);
    try {
      await remove();
      onChange(null);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "failed to remove it");
    } finally {
      setBusy(null);
    }
  }

  const runButton = (
    <button type="button" onClick={handleRun} disabled={busy !== null || !canRun} className={linkClass}>
      {busy === "running" ? busyLabel : result ? "Run again" : runLabel}
    </button>
  );
  const content = result?.content;
  const researched = isResearched(content) ? content : null;
  const createdOn = result && new Date(result.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <section aria-label={title} className="space-y-2 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-700">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{title}</p>
        {controls}
        {createdOn && <span className="text-xs text-neutral-500 dark:text-neutral-400">{createdOn}</span>}
        {result && (
          <span className="ml-auto flex gap-3 text-xs">
            <button type="button" aria-expanded={expanded} onClick={() => setExpanded(open => !open)} className={linkClass}>
              {expanded ? "Hide" : "Show"}
            </button>
            <button type="button" onClick={handleRemove} disabled={busy !== null} className={linkClass}>
              {busy === "removing" ? "Removing…" : "Remove"}
            </button>
          </span>
        )}
      </div>

      {result && staleNote && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {staleNote}
        </p>
      )}

      {result && expanded && content && (
        <div className="space-y-2">
          {children(content)}
          {researched && <Sources researched={researched} />}
        </div>
      )}

      {(!result || expanded) && (
        <div className="space-y-1">
          {inputs}
          {runButton}
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            {busy === "running" ? "This can take up to a minute." : result ? "Running it again replaces this one and is billed again." : about}
          </p>
        </div>
      )}
      {problem && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{problem}</p>}
    </section>
  );
}
