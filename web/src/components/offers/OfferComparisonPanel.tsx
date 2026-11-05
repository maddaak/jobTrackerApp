import { useState, type FormEvent } from "react";
import { compareOffers, type SavedComparison } from "../../api/offersApi";

export interface OfferComparisonPanelProps {
  pendingCount: number;
  onCompared: (comparison: SavedComparison) => void;
  comparison: SavedComparison | null;
}

// Each comparison is saved for the season shown, so returning to the page shows the last one free.
export default function OfferComparisonPanel({ pendingCount, onCompared, comparison }: OfferComparisonPanelProps) {
  const [priorities, setPriorities] = useState(comparison?.priorities ?? "");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setRunning(true);
    setError(null);
    try {
      const result = await compareOffers(priorities);
      // A failed run saved nothing, so the last comparison and the typed priorities stay.
      if (result.status === "ok") onCompared(result);
      else if (result.status === "unavailable") setError("The comparison is unavailable right now. Try again in a moment.");
      else setError("No AI provider is set up, so offers can't be compared.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to compare offers");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mb-6 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
      <h2 className="font-semibold">Help me decide</h2>
      <p className="mb-3 text-sm text-neutral-500 dark:text-neutral-400">
        AI weighs your {pendingCount === 1 ? "undecided offer" : `${pendingCount} undecided offers`} against
        what matters to you. Each comparison is a call to your AI provider, which may bill for it.
      </p>
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">What matters most to you?</span>
          <textarea
            rows={2}
            maxLength={2000}
            value={priorities}
            onChange={e => setPriorities(e.target.value)}
            placeholder="e.g. fully remote, growth into staff, total comp over base"
            className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </label>
        <button
          type="submit"
          disabled={running || pendingCount === 0}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {running ? "Comparing…" : "Compare offers"}
        </button>
      </form>

      {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {comparison && (
        <div className="mt-3 space-y-1">
          <p className={`rounded p-3 text-sm ${comparison.stale
            ? "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
            : "bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100"}`}>
            {comparison.summary}
          </p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Compared {new Date(comparison.createdAt).toLocaleDateString()}.
            {comparison.stale && " Your offers have changed since, so this may no longer hold. Compare again for an up-to-date answer."}
          </p>
        </div>
      )}
    </section>
  );
}
