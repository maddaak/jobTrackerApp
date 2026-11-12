import { useEffect, useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import {
  createSeason, deleteSeason, listSeasons, renameSeason, reopenSeason, viewSeason, type Season,
} from "../api/seasonsApi";
import { getSeasonStats, type SeasonStats } from "../api/metricsApi";
import SeasonCard from "../components/seasons/SeasonCard";
import CloseSeasonDialog from "../components/seasons/CloseSeasonDialog";
import SeasonNameForm from "../components/seasons/SeasonNameForm";
import type { SeasonOutlet } from "../routes/ProtectedRoute";

// Every job hunt side by side: how each went, and a way into any of them.
export default function SeasonsPage() {
  const { onSeasonChanged, onSeasonsRenamed } = useOutletContext<SeasonOutlet>();
  const navigate = useNavigate();
  const [seasons, setSeasons] = useState<Season[] | null>(null);
  const [stats, setStats] = useState<SeasonStats[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
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

  // Closing or reopening changes what every page may edit, so the whole app reloads, as switching seasons does.
  function replaced(saved: Season) {
    setSeasons(current => current && current.map(other => (other.id === saved.id ? saved : other)));
    onSeasonChanged();
  }

  // Newest first: the search you're in now is the one you came here for.
  const newestFirst = seasons ? [...seasons].reverse() : null;

  return (
    <div className="min-w-0 p-6">
      <div className="mx-auto max-w-4xl">
        <div className="mb-2 flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Seasons</h1>
          {!starting && (
            <button type="button" onClick={() => setStarting(true)}
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
              + Start a new season
            </button>
          )}
        </div>
        <p className="mb-6 text-sm text-neutral-600 dark:text-neutral-300">
          Each season is one job hunt. The board, calendar, offers, and Insights show one season at a time; the
          others keep every job until you open them again. A job filed under the wrong one moves from its own dialog.
        </p>

        {starting && (
          <div className="mb-6 rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
            <p className="mb-2 text-sm font-medium">Name the new season</p>
            <SeasonNameForm
              label="Name for the new season"
              initial=""
              submitLabel="Start season"
              // Starting one shows it, so the whole app reloads onto the new, empty search.
              onSave={async name => { await run(async () => { await createSeason(name); onSeasonChanged(); navigate("/"); }); }}
              onCancel={() => setStarting(false)}
            />
          </div>
        )}

        {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!newestFirst && !error && <p className="text-sm">Loading…</p>}

        <div className="space-y-4">
          {newestFirst?.map(season => (
            <SeasonCard
              key={season.id}
              season={season}
              stats={stats.find(entry => entry.seasonId === season.id)}
              onlyOne={newestFirst.length === 1}
              onRename={rename(season)}
              onDelete={() => { run(async () => { await deleteSeason(season.id); onSeasonChanged(); }); }}
              onOpen={open(season)}
              onCloseSeason={() => setClosing(season)}
              onReopen={() => { run(async () => replaced(await reopenSeason(season.id))); }}
              onSummary={() => navigate(`/seasons/${season.id}/summary`)}
            />
          ))}
        </div>
        {closing && (
          <CloseSeasonDialog
            season={closing}
            onClose={() => setClosing(null)}
            onClosed={saved => { setClosing(null); replaced(saved); navigate(`/seasons/${saved.id}/summary`); }}
          />
        )}
      </div>
    </div>
  );
}
