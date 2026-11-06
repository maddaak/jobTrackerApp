import { useEffect, useMemo, useState } from "react";
import { getMetrics, type Metrics } from "../api/metricsApi";
import PipelineSankey from "../components/PipelineSankey";
import InterviewRoundsTable from "../components/metrics/InterviewRoundsTable";
import WeeklyActivityChart from "../components/metrics/WeeklyActivityChart";
import ResumeResponsesTable from "../components/metrics/ResumeResponsesTable";
import MetricsTiles from "../components/metrics/MetricsTiles";
import InsightsPanel from "../components/metrics/InsightsPanel";
import { useAuth } from "../hooks/useAuth";
import { STAGE_LABELS, OUTCOME_LABELS } from "../api/jobsApi";
import { nodeLabel, toSankeyData } from "../sankeyNodes";

const headerClass = "border-b border-neutral-300 px-3 py-1.5 font-medium dark:border-neutral-700";
const cellClass = "border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800";

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { aiConfigured } = useAuth();

  useEffect(() => {
    // Ignore a load that resolves after unmount.
    let ignore = false;
    getMetrics()
      .then(loaded => { if (!ignore) setMetrics(loaded); })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load metrics"); });
    return () => { ignore = true; };
  }, []);

  const chart = useMemo(() => (metrics ? toSankeyData(metrics) : null), [metrics]);
  const journeys = metrics?.sankeyPaths?.reduce((sum, path) => sum + path.jobs, 0) ?? 0;

  return (
    <div className="min-w-0 p-6">
      <h1 className="mb-6 text-center text-2xl font-semibold">Insights</h1>

      {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {metrics && chart && (
        <>
          <MetricsTiles metrics={metrics} />

          {aiConfigured && metrics.summary.totalJobs > 0 && (
            <div className="mb-8">
              <InsightsPanel totalJobs={metrics.summary.totalJobs} />
            </div>
          )}

          <h2 className="mb-3 text-lg font-medium">Overview</h2>
          <div className="flex flex-wrap gap-16">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Funnel</h3>
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className={`${headerClass} text-left`}>Stage</th>
                    <th className={`${headerClass} text-right`}>Jobs reached</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.funnel.map(row => (
                    <tr key={row.stage}>
                      <td className={cellClass}>{STAGE_LABELS[row.stage]}</td>
                      <td className={`${cellClass} text-right`}>{row.count}</td>
                    </tr>
                  ))}
                  {metrics.outcomeCounts.map(row => (
                    <tr key={row.outcome}>
                      <td className={cellClass}>{OUTCOME_LABELS[row.outcome]}</td>
                      <td className={`${cellClass} text-right`}>{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Interview rounds</h3>
              <InterviewRoundsTable rows={metrics.interviewRoundCounts} labelFor={nodeLabel} />
            </div>

            {metrics.weeklyActivity?.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Weekly activity</h3>
                <WeeklyActivityChart weeks={metrics.weeklyActivity} />
              </div>
            )}

            {metrics.resumeResponses?.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Replies by resume</h3>
                <ResumeResponsesTable rows={metrics.resumeResponses} />
              </div>
            )}
          </div>

          {/* Secondary on purpose: the tiles and tables answer the everyday questions; the flow is for digging in. */}
          <details className="mt-10 rounded border border-neutral-200 dark:border-neutral-800">
            <summary className="cursor-pointer px-4 py-3 text-lg font-medium">Pipeline flow</summary>
            <div className="px-4 pb-4">
              {/* Says why its first stage holds fewer than the Applications tile, rather than leaving it to look wrong. */}
              {chart.links.length > 0 && journeys < metrics.summary.totalJobs && (
                <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
                  Reposts linked as replacing each other are drawn as one journey: {journeys}{" "}
                  {journeys === 1 ? "journey" : "journeys"} from {metrics.summary.totalJobs} applications.
                </p>
              )}
              {chart.links.length > 0 ? (
                <div className="mb-2 overflow-x-auto rounded border border-neutral-300 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900">
                  <PipelineSankey
                    nodes={chart.nodes}
                    links={chart.links}
                    paths={metrics.sankeyPaths}
                    minHeight={500}
                  />
                </div>
              ) : (
                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                  No pipeline flow yet. It fills in as jobs progress.
                </p>
              )}
            </div>
          </details>
        </>
      )}
    </div>
  );
}
