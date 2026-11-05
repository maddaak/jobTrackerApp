import { useState } from "react";
import { checkMarket, clearMarketCheck, type MarketCheck, type Offer } from "../../api/offersApi";
import { safeHref } from "../../safeHref";

export interface MarketCheckPanelProps {
  offer: Offer;
  onChanged: () => void;
}

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const VERDICTS: Record<MarketCheck["verdict"], { label: string; className: string }> = {
  below: { label: "Below market", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200" },
  at: { label: "At market", className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200" },
  above: { label: "Above market", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200" },
  unclear: { label: "Not enough data", className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200" },
};

const linkClass = "text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400";

function range(check: MarketCheck): string | null {
  if (check.typicalLow === null && check.typicalHigh === null) return null;
  if (check.typicalLow === null || check.typicalHigh === null) {
    return `Typical: about ${money.format((check.typicalLow ?? check.typicalHigh)!)} per year`;
  }
  return `Typical: ${money.format(check.typicalLow)} to ${money.format(check.typicalHigh)} per year`;
}

// Each check is a billed AI call (with web searches where the provider has them), so the last result is
// shown from the offer and a new one only runs on request. Collapsed by default so the card stays a glance.
export default function MarketCheckPanel({ offer, onChanged }: MarketCheckPanelProps) {
  const [busy, setBusy] = useState<"checking" | "removing" | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const check = offer.marketCheck;
  const stale = offer.marketCheckStale;

  async function runCheck() {
    setBusy("checking");
    setProblem(null);
    try {
      const outcome = await checkMarket(offer.jobId);
      if (outcome.status === "ok") onChanged();
      else setProblem("The market check is unavailable right now. Try again in a moment.");
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "failed to check the market");
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    if (!window.confirm("Remove this market check? Running it again is billed by your AI provider.")) return;
    setBusy("removing");
    setProblem(null);
    try {
      await clearMarketCheck(offer.jobId);
      onChanged();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "failed to remove the market check");
    } finally {
      setBusy(null);
    }
  }

  const checkButton = (
    <button type="button" onClick={runCheck} disabled={busy !== null} className={linkClass}>
      {busy === "checking" ? "Checking the market…" : check ? "Check again" : "Check the market"}
    </button>
  );

  if (!check) {
    return (
      <div className="mt-3 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
        {checkButton}
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          {busy === "checking"
            ? "Researching pay for this role. This can take up to a minute."
            : "Compares this offer with current pay for the role. Uses your AI provider, which bills for it."}
        </p>
        {problem && <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">{problem}</p>}
      </div>
    );
  }

  const verdict = VERDICTS[check.verdict];
  const typical = range(check);
  const checkedOn = new Date(check.checkedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <section aria-label="Market check" className="mt-3 space-y-2 border-t border-neutral-200 pt-3 text-sm dark:border-neutral-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded px-2 py-0.5 text-xs font-medium ${verdict.className} ${stale ? "opacity-60" : ""}`}>
          {verdict.label}
        </span>
        {typical && <span className="tabular-nums text-neutral-600 dark:text-neutral-300">{typical}</span>}
        <span className="ml-auto flex gap-3 text-xs">
          <button type="button" aria-expanded={expanded} onClick={() => setExpanded(open => !open)} className={linkClass}>
            {expanded ? "Hide analysis" : "Show analysis"}
          </button>
          <button type="button" onClick={remove} disabled={busy !== null} className={linkClass}>
            {busy === "removing" ? "Removing…" : "Remove"}
          </button>
        </span>
      </div>

      {stale && (
        <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Out of date: you've changed this offer's pay, title, or location since this check on {checkedOn}, so it
          describes the old details. {checkButton}
        </p>
      )}

      {expanded && (
        <>
          <p>{check.summary}</p>
          {check.negotiationPoints.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5">
              {check.negotiationPoints.map(point => <li key={point}>{point}</li>)}
            </ul>
          )}
          {check.sources.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Sources</p>
              <ul className="mt-1 space-y-0.5">
                {check.sources.map(source => {
                  const href = safeHref(source.url);
                  return (
                    <li key={source.url} className="truncate">
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer" title={source.url} className={linkClass}>
                          {source.title || source.url} ↗
                        </a>
                      ) : (
                        source.title || source.url
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}

      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {check.searched
          ? "Researched on the web"
          : "An estimate from the AI model's general knowledge, with no live sources: it may be out of date"}
        {` · checked ${checkedOn}`}
        {!stale && <>{" · "}{checkButton}</>}
      </p>
      {problem && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{problem}</p>}
    </section>
  );
}
