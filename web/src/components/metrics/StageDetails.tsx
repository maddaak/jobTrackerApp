import type { SankeyPath } from "../../api/metricsApi";
import type { journeyThrough } from "../../sankeyNodes";

// The routes listed for a stage, most common first.
const MAX_ROUTES_LISTED = 6;

interface Stage {
  key: string;
  name: string;
}

// Under the Sankey: one stage's routes beside its companies, each picking out the other. Its height is fixed
// whether or not a stage is shown, so hovering never moves what's below: a jump slid the stage out from under
// the cursor, which flickered.
export default function StageDetails({
  stage, pinned, journey, listedRoute, tracedRoute, heldRoute, job, heldJob, nameOf,
  onRouteHover, onRouteHold, onJobHover, onJobHold, onUnpin, onMouseEnter, onMouseLeave,
}: {
  stage: Stage | null;
  pinned: Stage | null;
  journey: ReturnType<typeof journeyThrough> | null;
  // The route row pointed at or held, which narrows the companies to its own.
  listedRoute: SankeyPath | null;
  // The route the chart traces: that one, or the one the company pointed at took.
  tracedRoute: SankeyPath | null;
  heldRoute: SankeyPath | null;
  // The company pointed at or held, and the one held, by job id.
  job: number | null;
  heldJob: number | null;
  nameOf: (key: string) => string;
  onRouteHover: (routeKey: string | null) => void;
  // Clicking a route, or a company, holds that route and its companies until clicked again.
  onRouteHold: (routeKey: string) => void;
  onJobHover: (jobId: number | null) => void;
  onJobHold: (jobId: number) => void;
  onUnpin: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}) {
  const applications = [...(listedRoute ?? journey)?.applications ?? []]
    .sort((a, b) => a.company.localeCompare(b.company) || a.role.localeCompare(b.role));
  const perCompany = new Map<string, number>();
  applications.forEach(a => perCompany.set(a.company, (perCompany.get(a.company) ?? 0) + 1));
  // A company's route can rank below the cut; it's listed anyway, or there'd be no row showing it held.
  const listed = journey?.routes.slice(0, MAX_ROUTES_LISTED) ?? [];
  if (tracedRoute && !listed.includes(tracedRoute)) listed.push(tracedRoute);

  return (
    <div onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave} className="flex h-[14rem] flex-col px-2 pt-3 text-sm">
      {!stage || !journey ? (
        <p className="text-neutral-500 dark:text-neutral-400">
          Point at a stage to see how jobs reached it, where they went next, and at which companies. Click it to keep
          it here.
        </p>
      ) : (
        <>
          <div className="flex items-baseline gap-3">
            <p aria-live="polite" className="truncate font-medium">
              {stage.name} · {journey.jobs} {journey.jobs === 1 ? "job" : "jobs"}
            </p>
            {pinned?.key === stage.key ? (
              <span className="flex shrink-0 items-center gap-1 rounded bg-neutral-200 px-1.5 text-xs dark:bg-neutral-700">
                Pinned
                <button type="button" onClick={onUnpin} aria-label={`Unpin ${stage.name}`} className="hover:text-neutral-900 dark:hover:text-white">
                  ✕
                </button>
              </span>
            ) : (
              <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                {pinned ? `Previewing; ${pinned.name} is pinned` : "Click the stage to keep it here"}
              </span>
            )}
          </div>
          <div className="mt-2 grid min-h-0 flex-1 grid-cols-[fit-content(60%)_minmax(0,1fr)] gap-6">
            <div className="min-w-0">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">How they got here, and their next step</p>
              <ul aria-label={`Routes through ${stage.name}`} className="mt-1 space-y-0.5 text-neutral-600 dark:text-neutral-300">
                {listed.map(r => {
                  const key = r.nodes.join(">");
                  const names = r.nodes.map(nameOf);
                  return (
                    <li key={key}>
                      {/* One line each, cut short with the whole route on hover, so the list never outgrows its space.
                          The picked route stands out and the rest step back, as they do on the chart. */}
                      <button
                        type="button"
                        title={names.join(" → ")}
                        onMouseEnter={() => onRouteHover(key)}
                        onMouseLeave={() => onRouteHover(null)}
                        onFocus={() => onRouteHover(key)}
                        onBlur={() => onRouteHover(null)}
                        onClick={() => onRouteHold(key)}
                        aria-pressed={heldRoute === r}
                        aria-current={tracedRoute === r ? "true" : undefined}
                        className={`block w-full cursor-pointer truncate rounded border-l-4 px-1.5 text-left ${tracedRoute === r
                          ? "border-indigo-500 bg-indigo-50 text-neutral-900 dark:bg-indigo-500/20 dark:text-white"
                          : `border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-800 ${tracedRoute ? "opacity-40" : ""}`}`}
                      >
                        <span className="tabular-nums">{r.jobs} {r.jobs === 1 ? "job" : "jobs"}:</span>{" "}
                        {r.nodes.map((node, i) => (
                          <span key={node}>
                            {i > 0 && " → "}
                            <span className={node === stage.key ? "font-semibold text-neutral-900 dark:text-white" : undefined}>{names[i]}</span>
                          </span>
                        ))}
                      </button>
                    </li>
                  );
                })}
                {journey.routes.length > listed.length && (
                  <li className="border-l-4 border-transparent px-1.5">and {journey.routes.length - listed.length} more routes</li>
                )}
              </ul>
            </div>
            <div className="flex min-h-0 flex-col border-l border-neutral-200 pl-6 dark:border-neutral-700">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {listedRoute ? "Companies on this route" : "Companies"} ({applications.length}) · point at one for its
                route, click to keep it
              </p>
              {/* Scrolls on its own, so a stage with dozens of companies keeps the area's height. */}
              <ul aria-label={`Companies at ${stage.name}`} className="mt-1 flex min-h-0 flex-wrap content-start gap-1.5 overflow-y-auto">
                {applications.map(a => (
                  <li key={a.jobId}>
                    <button
                      type="button"
                      onMouseEnter={() => onJobHover(a.jobId)}
                      onMouseLeave={() => onJobHover(null)}
                      onFocus={() => onJobHover(a.jobId)}
                      onBlur={() => onJobHover(null)}
                      onClick={() => onJobHold(a.jobId)}
                      aria-pressed={heldJob === a.jobId}
                      title={a.postings > 1 ? `${a.role}, the newest of ${a.postings} linked postings` : a.role}
                      className={`cursor-pointer rounded border px-2 py-0.5 ${job === a.jobId
                        ? "border-indigo-500 bg-indigo-50 font-medium text-indigo-900 ring-1 ring-indigo-500 dark:bg-indigo-500/20 dark:text-indigo-100"
                        : "border-neutral-200 hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-500"}`}
                    >
                      {/* Two journeys at one company would read the same, so those say which role. */}
                      {a.postings > 1
                        ? `${a.company} (${a.postings} postings)`
                        : perCompany.get(a.company)! > 1 ? `${a.company} (${a.role})` : a.company}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
