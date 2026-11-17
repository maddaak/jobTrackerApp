import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { createSeason, deleteSeason, listSeasons, renameSeason, seasonSpan, viewSeason, type Season } from "../api/seasonsApi";
import { getSeasonStats, type SeasonStats } from "../api/metricsApi";
import LobbyFrame from "../components/LobbyFrame";
import SeasonCard from "../components/seasons/SeasonCard";
import CloseSeasonDialog from "../components/seasons/CloseSeasonDialog";
import SeasonNameForm from "../components/seasons/SeasonNameForm";
import type { SeasonOutlet } from "../routes/ProtectedRoute";

// The lobby: every job hunt, outside any one of them. A new hunt first, then the ones still open, then the
// finished ones, each opening on its summary. Opening a hunt is what brings the sidebar back.
export default function SeasonsPage() {
  const { onSeasonChanged, onSeasonsRenamed } = useOutletContext<SeasonOutlet>();
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [stats, setStats] = useState<SeasonStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [closing, setClosing] = useState<Season | null>(null);

  useEffect(() => {
    let ignore = false;
    Promise.all([listSeasons(), getSeasonStats()])
      .then(([loadedSeasons, loadedStats]) => {
        if (!Array.isArray(loadedSeasons)) throw new Error("failed to load seasons");
        if (ignore) return;
        setSeasons(loadedSeasons);
        setStats(Array.isArray(loadedStats) ? loadedStats : []);
      })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load seasons"); });
    return () => { ignore = true; };
  }, []);

  // True when it worked, so a rename that failed keeps its field open.
  async function run(action: () => Promise<void>): Promise<boolean> {
    setError(null);
    try {
      await action();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save");
      return false;
    }
  }

  // A rename changes only a name, so the page stays put and just the sidebar's picker reloads.
  const rename = (season: Season) => (name: string) => run(async () => {
    const saved = await renameSeason(season.id, name);
    setSeasons(current => current && current.map(other => (other.id === saved.id ? saved : other)));
    onSeasonsRenamed();
  });

  // Showing a season reloads every page's data, then lands on the page asked for.
  const open = (season: Season) => (path: string) => {
    run(async () => {
      await viewSeason(season.id);
      onSeasonChanged();
      navigate(path);
    });
  };

  // Newest first: the search you're in now is the one you came here for.
  const started = (season: Season) => season.firstApplied ?? season.createdAt;
  const newestFirst = seasons ? [...seasons].sort((a, b) => started(b).localeCompare(started(a))) : null;
  const active = newestFirst?.filter(season => !season.closedAt) ?? [];
  const past = newestFirst?.filter(season => season.closedAt) ?? [];

  return (
    <LobbyFrame>
      <section aria-labelledby="start-hunt" className="rounded-xl border border-blue-200 bg-blue-50 p-8 text-center dark:border-blue-900 dark:bg-blue-950/30">
        <h1 id="start-hunt" className="text-2xl font-semibold">Start a new job hunt</h1>
        <p className="mb-5 mt-1 text-sm text-neutral-600 dark:text-neutral-300">
          Give it a name, like the role or the year, and your board starts empty.
        </p>
        <div className="mx-auto max-w-md">
          <SeasonNameForm label="Name for the new hunt" initial="" submitLabel="Start hunt"
            // Starting one shows it, so the whole app reloads onto the new, empty search.
            onSave={async name => { await run(async () => { await createSeason(name); onSeasonChanged(); navigate("/"); }); }} />
        </div>
      </section>

      {error && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
      {!newestFirst && !error && <p className="mt-4 text-sm">Loading…</p>}

      {active.length > 0 && (
        <section aria-labelledby="active-hunts">
          <h2 id="active-hunts" className="mb-3 mt-10 text-lg font-medium">Active</h2>
          <div className="space-y-4">
            {active.map(season => (
              <SeasonCard
                key={season.id}
                season={season}
                stats={stats.find(entry => entry.seasonId === season.id)}
                onlyOne={newestFirst?.length === 1}
                onRename={rename(season)}
                onDelete={() => { run(async () => {
                  await deleteSeason(season.id);
                  setSeasons(current => current && current.filter(other => other.id !== season.id));
                  onSeasonChanged();
                }); }}
                onOpen={open(season)}
                onCloseSeason={() => setClosing(season)}
              />
            ))}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section aria-labelledby="past-hunts">
          <h2 id="past-hunts" className="mb-3 mt-10 text-lg font-medium">Past</h2>
          <ul className="space-y-2">
            {past.map(season => {
              const span = seasonSpan(season);
              return (
                <li key={season.id}>
                  <Link to={`/seasons/${season.id}/summary`}
                    onClick={e => { e.preventDefault(); open(season)(`/seasons/${season.id}/summary`); }}
                    className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 px-4 py-3 hover:border-blue-400 dark:border-neutral-800 dark:hover:border-blue-500">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{season.name}</span>
                      <span className="text-xs text-neutral-500 dark:text-neutral-400">
                        {span ? `${span} · ` : ""}{season.jobCount} {season.jobCount === 1 ? "application" : "applications"}
                      </span>
                    </span>
                    <span aria-hidden="true" className="text-neutral-400">→</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {closing && (
        <CloseSeasonDialog
          season={closing}
          onClose={() => setClosing(null)}
          onClosed={saved => { setClosing(null); onSeasonChanged(); navigate(`/seasons/${saved.id}/summary`); }}
          onOpenOffers={section => { setClosing(null); open(closing)(`/offers#${section}`); }}
        />
      )}
    </LobbyFrame>
  );
}
