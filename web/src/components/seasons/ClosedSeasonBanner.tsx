import { useState } from "react";
import { Link } from "react-router-dom";
import { reopenSeason, type Season } from "../../api/seasonsApi";

// Says up front that the season on screen is finished, so a refused change isn't the first a person hears
// of it, and offers Edit right there. core is what actually refuses the change.
export default function ClosedSeasonBanner({ season, onReopened }: { season: Season; onReopened: () => void }) {
  const [error, setError] = useState<string | null>(null);

  async function reopen() {
    setError(null);
    try {
      await reopenSeason(season.id);
      onReopened();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to reopen the season");
    }
  }

  return (
    <div role="status" className="flex flex-wrap items-center gap-3 border-b border-amber-300 bg-amber-50 px-6 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
      <span className="flex-1">
        <strong>{season.name}</strong> is closed, so it's read-only.
        {error && <span className="ml-2 text-red-700 dark:text-red-300">{error}</span>}
      </span>
      <Link to={`/seasons/${season.id}/summary`} className="font-medium underline">See summary</Link>
      <button type="button" onClick={reopen}
        className="rounded border border-amber-400 px-2 py-0.5 font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-900/40">
        Edit
      </button>
    </div>
  );
}
