import { useState } from "react";
import { listSeasons, moveJobToSeason, type Season } from "../../api/seasonsApi";
import type { JobSummary } from "../../api/jobsApi";

export interface SeasonPickerProps {
  job: JobSummary;
  onError: (message: string) => void;
  onChanged: () => void;
}

const buttonClass = "text-sm text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400";

// For a job filed under the wrong search. The seasons load on request, since most openings never need them.
export default function SeasonPicker({ job, onError, onChanged }: SeasonPickerProps) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const loaded = await listSeasons();
      if (!Array.isArray(loaded)) throw new Error("failed to load seasons");
      setSeasons(loaded);
    } catch (err) {
      onError(err instanceof Error ? err.message : "failed to load seasons");
    } finally {
      setBusy(false);
    }
  }

  async function move(seasonId: number) {
    setBusy(true);
    try {
      await moveJobToSeason(seasonId, job.id);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "failed to move the job");
    } finally {
      setBusy(false);
    }
  }

  if (!seasons) {
    return <button type="button" onClick={open} disabled={busy} className={buttonClass}>Move to another season</button>;
  }
  if (seasons.length < 2) {
    return (
      <p className="text-sm text-neutral-500 dark:text-neutral-400">
        This is your only season. Start another from the season picker in the sidebar to move jobs into it.
      </p>
    );
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium">Season</span>
      <select
        value={job.seasonId}
        disabled={busy}
        onChange={e => move(Number(e.target.value))}
        className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900"
      >
        {seasons.map(season => <option key={season.id} value={season.id}>{season.name}</option>)}
      </select>
    </label>
  );
}
