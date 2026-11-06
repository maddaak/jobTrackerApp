import { useState } from "react";
import type { Season } from "../../api/seasonsApi";
import type { SeasonStats } from "../../api/metricsApi";
import SeasonNameForm from "./SeasonNameForm";

export interface SeasonCardProps {
  season: Season;
  stats: SeasonStats | undefined;
  onlyOne: boolean;
  // Resolves true once saved; false keeps the field open to try again.
  onRename: (name: string) => Promise<boolean>;
  onDelete: () => void;
  // Shows this season on the given page: "/" for the board, "/insights" for its numbers.
  onOpen: (path: string) => void;
}

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const percent = (part: number, whole: number) => (whole === 0 ? undefined : `${Math.round((part / whole) * 100)}% of applications`);

function Stat({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="text-xs text-neutral-500 dark:text-neutral-400">{detail}</p>}
    </div>
  );
}

export default function SeasonCard({ season, stats, onlyOne, onRename, onDelete, onOpen }: SeasonCardProps) {
  const [editing, setEditing] = useState(false);
  const applications = stats?.applications ?? 0;
  // core refuses these too; saying why up front beats a refusal after the click.
  const cantDelete = season.jobCount > 0
    ? "Move or delete this season's jobs first"
    : onlyOne ? "You always keep at least one season" : null;

  return (
    <article
      aria-label={season.name}
      className={`rounded-lg border p-5 ${season.active ? "border-blue-400 dark:border-blue-700" : "border-neutral-200 dark:border-neutral-800"}`}
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {editing ? (
            <SeasonNameForm
              label={`New name for ${season.name}`}
              initial={season.name}
              submitLabel="Save"
              onSave={async name => { if (await onRename(name)) setEditing(false); }}
              onCancel={() => setEditing(false)}
            />
          ) : (
            <h2 className="truncate text-lg font-semibold" title={season.name}>{season.name}</h2>
          )}
          <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
            {stats?.firstApplied && stats.lastApplied
              ? `${day(stats.firstApplied)} to ${day(stats.lastApplied)}`
              : "No jobs yet"}
            {season.active && <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200">Showing now</span>}
          </p>
        </div>
        {!editing && (
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <button type="button" aria-label={`Rename ${season.name}`} onClick={() => setEditing(true)}
              className="text-blue-600 hover:underline dark:text-blue-400">
              Rename
            </button>
            <button
              type="button"
              aria-label={`Delete ${season.name}`}
              disabled={cantDelete !== null}
              title={cantDelete ?? undefined}
              onClick={onDelete}
              className="text-red-600 hover:underline disabled:cursor-not-allowed disabled:opacity-40 dark:text-red-400"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Stat label="Applications" value={applications} />
        <Stat label="Heard back" value={stats?.heardBack ?? 0} detail={percent(stats?.heardBack ?? 0, applications)} />
        <Stat label="Interviewed" value={stats?.interviewed ?? 0} detail={percent(stats?.interviewed ?? 0, applications)} />
        <Stat label="Offers" value={stats?.offers ?? 0} />
        <Stat label="Still active" value={stats?.active ?? 0} />
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={() => onOpen("/")}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
          Open board
        </button>
        <button type="button" onClick={() => onOpen("/insights")}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800">
          See Insights
        </button>
      </div>
    </article>
  );
}
