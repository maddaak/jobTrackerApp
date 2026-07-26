import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sankey, ResponsiveContainer, Layer, Rectangle } from "recharts";
import type { NodeProps, LinkProps } from "recharts/types/chart/Sankey";
import { getMetrics, type Metrics } from "../api/metricsApi";
import { STAGE_LABELS, OUTCOME_LABELS, type Stage, type Outcome } from "../api/jobsApi";
import { INTERVIEW_TYPE_LABELS } from "../api/interviewsApi";

export function nodeLabel(name: string): string {
  if (name in STAGE_LABELS) return STAGE_LABELS[name as Stage];
  if (name in OUTCOME_LABELS) return OUTCOME_LABELS[name as Outcome];
  return name;
}

// Node name sits above its own bar (rather than only on hover) so the chart reads without
// needing to mouse over every box — same reasoning for the value label on each link below.
function SankeyNodeBar({ x, y, width, height, payload }: NodeProps) {
  return (
    <Layer>
      <Rectangle x={x} y={y} width={width} height={height} fill="#2563eb" fillOpacity={0.9} />
      <text
        x={x + width / 2}
        y={y - 6}
        textAnchor="middle"
        fontSize={12}
        fontWeight={500}
        className="fill-neutral-700 dark:fill-neutral-200"
      >
        {payload.name}
      </text>
    </Layer>
  );
}

function SankeyLinkFlow({ sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, payload }: LinkProps) {
  const midX = (sourceControlX + targetControlX) / 2;
  const midY = (sourceY + targetY) / 2;
  return (
    <Layer>
      <path
        d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
        fill="none"
        stroke="#93c5fd"
        strokeOpacity={0.5}
        strokeWidth={linkWidth}
      />
      <text
        x={midX}
        y={midY}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={11}
        fontWeight={600}
        stroke="white"
        strokeWidth={3}
        style={{ paintOrder: "stroke" }}
        className="fill-blue-900"
      >
        {payload.value}
      </text>
    </Layer>
  );
}

// Stage node labels include the funnel's true "reached" total in parentheses — a stage
// node's own flow only reflects jobs that have moved PAST it, so a job parked at that
// stage (no outcome yet, hasn't progressed) would otherwise make the chart's number look
// smaller than the funnel table's for the same stage, with no visible explanation why.
export function toSankeyData(metrics: Metrics) {
  const names = Array.from(
    new Set(metrics.sankeyLinks.flatMap(link => [link.source, link.target])),
  );
  const indexOf = new Map(names.map((name, i) => [name, i]));
  const reachedByStage = new Map<string, number>(metrics.funnel.map(f => [f.stage, f.count]));
  return {
    nodes: names.map(name => {
      const reached = reachedByStage.get(name);
      const label = reached != null ? `${nodeLabel(name)} (${reached})` : nodeLabel(name);
      return { name: label };
    }),
    links: metrics.sankeyLinks.map(link => ({
      source: indexOf.get(link.source)!,
      target: indexOf.get(link.target)!,
      value: link.value,
    })),
  };
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMetrics()
      .then(setMetrics)
      .catch(err => setError(err instanceof Error ? err.message : "failed to load metrics"));
  }, []);

  return (
    <div className="min-w-0 p-6">
      <div className="relative mb-6 flex items-center justify-center">
        <h1 className="text-2xl font-semibold">Metrics</h1>
        <Link to="/" className="absolute left-0 text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Back
        </Link>
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {metrics && (
        <>
          <h2 className="mb-2 text-lg font-medium">Pipeline flow</h2>
          {metrics.sankeyLinks.length > 0 ? (
            <div className="mb-8 rounded border border-neutral-300 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900">
              <ResponsiveContainer width="100%" height={440}>
                <Sankey
                  data={toSankeyData(metrics)}
                  nodePadding={32}
                  margin={{ top: 28, right: 100, bottom: 10, left: 70 }}
                  node={SankeyNodeBar}
                  link={SankeyLinkFlow}
                />
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
              No jobs have moved past Resume Check yet — the flow chart fills in as jobs progress.
            </p>
          )}

          <h2 className="mb-2 text-lg font-medium">Funnel</h2>
          <table className="text-sm">
            <thead>
              <tr>
                <th className="border-b border-neutral-300 px-3 py-1.5 text-left font-medium dark:border-neutral-700">Stage</th>
                <th className="border-b border-neutral-300 px-3 py-1.5 text-left font-medium dark:border-neutral-700">Jobs reached</th>
              </tr>
            </thead>
            <tbody>
              {metrics.funnel.map(row => (
                <tr key={row.stage}>
                  <td className="border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">{STAGE_LABELS[row.stage]}</td>
                  <td className="border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">{row.count}</td>
                </tr>
              ))}
              {metrics.outcomeCounts.map(row => (
                <tr key={row.outcome}>
                  <td className="border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">{OUTCOME_LABELS[row.outcome]}</td>
                  <td className="border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mb-2 mt-8 text-lg font-medium">Interview rounds</h2>
          {metrics.interviewRoundCounts.some(row => row.count > 0) ? (
            <table className="text-sm">
              <thead>
                <tr>
                  <th className="border-b border-neutral-300 px-3 py-1.5 text-left font-medium dark:border-neutral-700">Type</th>
                  <th className="border-b border-neutral-300 px-3 py-1.5 text-left font-medium dark:border-neutral-700">Rounds</th>
                </tr>
              </thead>
              <tbody>
                {metrics.interviewRoundCounts.filter(row => row.count > 0).map(row => (
                  <tr key={row.interviewType}>
                    <td className="border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
                      {INTERVIEW_TYPE_LABELS[row.interviewType]}
                    </td>
                    <td className="border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">{row.count}</td>
                  </tr>
                ))}
                <tr>
                  <td className="px-3 py-1.5 font-medium">Total</td>
                  <td className="px-3 py-1.5 font-medium">
                    {metrics.interviewRoundCounts.reduce((sum, row) => sum + row.count, 0)}
                  </td>
                </tr>
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              No interview rounds scheduled yet.
            </p>
          )}
        </>
      )}
    </div>
  );
}
