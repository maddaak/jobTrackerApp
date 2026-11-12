import { useEffect, useState, type FormEvent } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import Modal from "./Modal";
import { createSeason, listSeasons, seasonSpan, seasonYear, viewSeason, type Season } from "../api/seasonsApi";

const ALL = "all";
const NEW = "new";
const MANAGE = "manage";

export interface SeasonSwitcherProps {
  // Every page's data depends on the season, so the caller reloads them all.
  onSwitched: () => void;
}

// Which job hunt the app is showing. A new season is the "start fresh" moment: the last search's
// jobs stay, just out of view until switched back to.
export default function SeasonSwitcher({ onSwitched }: SeasonSwitcherProps) {
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let ignore = false;
    listSeasons()
      .then(loaded => {
        // request casts without validating, and the switcher would crash on anything but a list.
        if (!Array.isArray(loaded)) throw new Error("failed to load seasons");
        if (!ignore) setSeasons(loaded);
      })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load seasons"); });
    return () => { ignore = true; };
  }, []);

  if (!seasons) {
    return error ? <p role="alert" className="px-3 text-xs text-red-600 dark:text-red-400">{error}</p> : null;
  }

  const active = seasons.find(season => season.active);
  // Newest hunt first, filed under the year it started.
  const started = (season: Season) => season.firstApplied ?? season.createdAt;
  const byNewest = [...seasons].sort((a, b) => started(b).localeCompare(started(a)));

  async function choose(value: string) {
    if (value === NEW) {
      setStarting(true);
      return;
    }
    if (value === MANAGE) {
      navigate("/seasons");
      return;
    }
    setError(null);
    try {
      await viewSeason(value === ALL ? null : Number(value));
      onSwitched();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to switch season");
    }
  }

  async function start(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await createSeason(name.trim());
      setStarting(false);
      onSwitched();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to start the season");
    } finally {
      setSaving(false);
    }
  }

  return (
    // A card of its own: the season decides what every page below it shows.
    <div className="rounded-lg border border-neutral-200 bg-white p-2.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {/* The heading is the way to the Seasons page, so the sidebar needs no separate entry for it. */}
      <NavLink
        to="/seasons"
        title="See all seasons"
        className={({ isActive }) => [
          "group mb-1.5 flex items-center justify-between px-1 text-sm font-semibold hover:text-blue-600 dark:hover:text-blue-400",
          isActive ? "text-blue-600 dark:text-blue-400" : "text-neutral-900 dark:text-neutral-100",
        ].join(" ")}
      >
        Season
        <span aria-hidden="true" className="text-xs font-normal text-neutral-400 group-hover:text-blue-600 dark:group-hover:text-blue-400">
          Manage ›
        </span>
      </NavLink>
      <select
        id="season-switcher"
        aria-label="Season"
        value={active ? String(active.id) : ALL}
        onChange={e => choose(e.target.value)}
        className="w-full rounded-md border border-neutral-300 bg-neutral-50 px-2 py-1.5 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800"
      >
        {[...new Set(byNewest.map(seasonYear))].map(year => (
          <optgroup key={year} label={String(year)}>
            {byNewest.filter(season => seasonYear(season) === year).map(season => {
              const span = seasonSpan(season);
              return (
                <option key={season.id} value={season.id}>
                  {season.name}{span && ` · ${span}`} ({season.jobCount})
                </option>
              );
            })}
          </optgroup>
        ))}
        {seasons.length > 1 && <option value={ALL}>All seasons</option>}
        <option value={NEW}>+ Start a new season…</option>
        <option value={MANAGE}>See all seasons…</option>
      </select>
      {error && <p role="alert" className="mt-1 px-1 text-xs text-red-600 dark:text-red-400">{error}</p>}

      <Modal open={starting} onClose={() => setStarting(false)} title="Start a new season">
        <form onSubmit={start} className="space-y-3">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            The board, calendar, offers, and Insights start empty for this search. Your other seasons keep
            every job, and you can switch back to them, or view all seasons together, from the sidebar.
          </p>
          <label className="block text-sm font-medium">
            Name
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Spring 2027 search"
              maxLength={100}
              required
              autoFocus
              className="mt-1 w-full rounded border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-900"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setStarting(false)} className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700">
              Cancel
            </button>
            <button type="submit" disabled={saving || !name.trim()} className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Starting…" : "Start season"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
