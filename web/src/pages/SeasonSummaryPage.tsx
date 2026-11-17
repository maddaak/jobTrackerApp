import { useEffect, useState, type MouseEvent } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { getSeasonSummary, type SeasonSummary } from "../api/metricsApi";
import { viewSeason } from "../api/seasonsApi";
import type { SeasonOutlet } from "../routes/ProtectedRoute";
import InterviewRoundsTable from "../components/metrics/InterviewRoundsTable";
import { nodeLabel } from "../sankeyNodes";
import { formatDay } from "../localDate";

const moment = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
const days = (count: number) => `${count} ${count === 1 ? "day" : "days"}`;

const secondary = "rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800";
const PAGES = [
  { label: "See Insights", path: "/insights", className: "rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700" },
  { label: "Open board", path: "/", className: secondary },
  { label: "See offers", path: "/offers", className: secondary },
];

function Tile({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
      <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{label}</p>
      <p className="text-2xl font-semibold tabular-nums">{value}</p>
      {detail && <p className="text-xs text-neutral-500 dark:text-neutral-400">{detail}</p>}
    </div>
  );
}

// One hunt start to finish: how fast companies answered, which rounds went well, and the offer taken.
export default function SeasonSummaryPage() {
  const { id } = useParams();
  const { onSeasonChanged } = useOutletContext<SeasonOutlet>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<SeasonSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    getSeasonSummary(Number(id))
      .then(loaded => { if (!ignore) setSummary(loaded); })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load the season summary"); });
    return () => { ignore = true; };
  }, [id]);

  const offer = summary?.acceptedOffer;

  // Every other page shows the season on screen, so this one is switched to first, as Seasons does.
  const open = (path: string) => async (e: MouseEvent) => {
    e.preventDefault();
    try {
      await viewSeason(Number(id));
      onSeasonChanged();
      navigate(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to switch season");
    }
  };

  return (
    <div className="min-w-0 p-6">
      <div className="mx-auto max-w-4xl">
        <Link to="/seasons" className="text-sm text-blue-600 hover:underline dark:text-blue-400">← All hunts</Link>
        {error && <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        {!summary && !error && <p className="mt-4 text-sm">Loading…</p>}
        {summary && (
          <>
            <h1 className="mt-2 text-2xl font-semibold">{summary.name}</h1>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {summary.firstApplied ? `Started ${moment(summary.firstApplied)}` : "No applications"}
              {summary.closedAt ? `, closed ${moment(summary.closedAt)}` : ", still open"}
            </p>
            <nav aria-label="This season's pages" className="mb-6 mt-3 flex flex-wrap gap-2">
              {PAGES.map(page => (
                <Link key={page.path} to={page.path} onClick={open(page.path)} className={page.className}>{page.label}</Link>
              ))}
            </nav>

            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label="Applications" value={summary.applications}
                detail="A role reposted counts once" />
              <Tile label="Average response time"
                value={summary.averageResponseDays === null ? "None yet" : days(summary.averageResponseDays)}
                detail={`Applied to rejected, closed, or ghosted, from ${summary.responsesMeasured} of ${summary.closedApplications} with a date`} />
              <Tile label="Rounds passed" value={summary.roundsPassed} />
              <Tile label="Rounds not passed" value={summary.roundsFailed} />
            </div>

            <h2 className="mb-3 text-lg font-medium">The offer you accepted</h2>
            {offer ? (
              <Link to="/offers#accepted" onClick={open("/offers#accepted")} title="See the full offer on the Offers page"
                className="mb-8 block rounded-lg border border-green-300 bg-green-50 p-5 hover:border-green-500 hover:shadow-sm dark:border-green-800 dark:bg-green-950/30 dark:hover:border-green-600">
                <p className="text-lg font-semibold">{offer.company}</p>
                <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">{offer.role}</p>
                <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-neutral-500 dark:text-neutral-400">Applied</dt>
                    <dd className="font-medium">{moment(offer.applied)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500 dark:text-neutral-400">Accepted</dt>
                    <dd className="font-medium">
                      {offer.acceptedOn ? formatDay(offer.acceptedOn) : "Not entered"}
                      {offer.daysToAccept !== null && (
                        <span className="ml-1 font-normal text-neutral-500 dark:text-neutral-400">({days(offer.daysToAccept)} after applying)</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-neutral-500 dark:text-neutral-400">Starts</dt>
                    <dd className="font-medium">{offer.startsOn ? formatDay(offer.startsOn) : "Not entered"}</dd>
                  </div>
                </dl>
                <p className="mt-3 text-sm text-blue-600 dark:text-blue-400">See the full offer →</p>
              </Link>
            ) : (
              <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
                {summary.closedAt ? "This hunt ended without an offer accepted." : "Closing the season records the offer you take."}
              </p>
            )}

            <h2 className="mb-1 text-lg font-medium">Interview rounds</h2>
            <p className="mb-3 text-sm text-neutral-600 dark:text-neutral-300">
              Each kind of round, how many you passed and didn't. Click a number for the companies.
            </p>
            <InterviewRoundsTable rows={summary.rounds} labelFor={nodeLabel} />
          </>
        )}
      </div>
    </div>
  );
}
