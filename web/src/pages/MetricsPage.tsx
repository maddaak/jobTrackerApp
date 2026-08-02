import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getMetrics, type Metrics } from "../api/metricsApi";
import PipelineSankey from "../components/PipelineSankey";
import { STAGE_LABELS, OUTCOME_LABELS, type Stage, type Outcome } from "../api/jobsApi";
import { INTERVIEW_TYPE_LABELS, type InterviewType } from "../api/interviewsApi";

// Sankey-only node names that are not stages, outcomes, or interview types.
const SANKEY_NODE_LABELS: Record<string, string> = {
  PANEL: "Panel",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  IN_PROGRESS: "In Progress",
};

export function nodeLabel(name: string): string {
  if (name in STAGE_LABELS) return STAGE_LABELS[name as Stage];
  if (name in SANKEY_NODE_LABELS) return SANKEY_NODE_LABELS[name];
  if (name in INTERVIEW_TYPE_LABELS) return INTERVIEW_TYPE_LABELS[name as InterviewType];
  if (name in OUTCOME_LABELS) return OUTCOME_LABELS[name as Outcome];
  // An enum key with no explicit label (e.g. a newly added backend value): title-case it so
  // it never reaches the user as raw SCREAMING_CASE ("SOME_NEW_KEY" -> "Some New Key").
  return name
    .toLowerCase()
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Stage nodes follow the pipeline as an ordered blue->violet ramp so progression reads left
// to right; outcome nodes use reserved status colors so a good/bad result is obvious.
const STAGE_COLORS: Record<Stage, string> = {
  RESUME_CHECK: "#93c5fd",
  INTERVIEW_REQUEST: "#60a5fa",
  INTERVIEW_STAGE: "#3b82f6",
  WAITING_INTERVIEW_RESULTS: "#6366f1",
  OFFER_STAGE: "#8b5cf6",
  FINALIZED: "#7c3aed",
};

const OUTCOME_COLORS: Record<Outcome, string> = {
  ACTIVE: "#94a3b8",
  OFFER_ACCEPTED: "#22c55e",
  OFFER_DECLINED: "#f59e0b",
  REJECTED: "#ef4444",
  GHOSTED: "#a8a29e",
  WITHDRAWN: "#78716c",
};

// Distinct color per round so a flow that skips a column doesn't blend into the round it passes behind. Extra entries are future-proof fallbacks for round types not yet seen.
const INTERVIEW_ROUND_COLORS: Record<string, string> = {
  RECRUITER_PHONE_SCREEN: "#e69f00",
  TECHNICAL_PHONE_SCREEN: "#56b4e9",
  HIRING_MANAGER_SCREEN: "#d55e00",
  SYSTEM_DESIGN: "#0072b2",
  PANEL: "#cc79a7",
  TAKE_HOME_ASSIGNMENT: "#009e73",
  TECHNICAL_CODE_REVIEW: "#7f3c8d",
  BEHAVIOR: "#999933",
  CULTURE_FIT: "#6699cc",
  VALUES: "#661100",
};

const SANKEY_NODE_COLORS: Record<string, string> = {
  OFFER: "#8b5cf6",
  ACCEPTED: "#22c55e",
  DECLINED: "#f59e0b",
  IN_PROGRESS: "#94a3b8",
};

function colorForNode(name: string): string {
  if (name in STAGE_COLORS) return STAGE_COLORS[name as Stage];
  if (name in INTERVIEW_ROUND_COLORS) return INTERVIEW_ROUND_COLORS[name];
  if (name in SANKEY_NODE_COLORS) return SANKEY_NODE_COLORS[name];
  if (name in OUTCOME_COLORS) return OUTCOME_COLORS[name as Outcome];
  return "#94a3b8";
}

// Node totals are the actual flow through each node (max of in/out) so the labels match the drawn bars.
export function toSankeyData(metrics: Metrics) {
  const links = metrics.sankeyLinks;
  const names = Array.from(new Set(links.flatMap(link => [link.source, link.target])));
  const indexOf = new Map(names.map((name, i) => [name, i]));
  const inSum = new Map<string, number>();
  const outSum = new Map<string, number>();
  for (const link of links) {
    outSum.set(link.source, (outSum.get(link.source) ?? 0) + link.value);
    inSum.set(link.target, (inSum.get(link.target) ?? 0) + link.value);
  }
  return {
    nodes: names.map(name => ({
      key: name,
      name: nodeLabel(name),
      total: Math.max(inSum.get(name) ?? 0, outSum.get(name) ?? 0),
      color: colorForNode(name),
    })),
    links: links.map(link => ({
      source: indexOf.get(link.source)!,
      target: indexOf.get(link.target)!,
      value: link.value,
    })),
  };
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ key: string; label: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Ignore a mount-time load that resolves after this page has unmounted.
    let ignore = false;
    getMetrics()
      .then(loaded => { if (!ignore) setMetrics(loaded); })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load metrics"); });
    return () => { ignore = true; };
  }, []);

  // Dismiss the companies panel on a click outside it.
  useEffect(() => {
    if (!selected) return;
    function onMouseDown(e: MouseEvent) {
      // A node click reopens the panel via its own handler, so only a click inside the panel skips closing.
      if (panelRef.current?.contains(e.target as Node)) return;
      setSelected(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [selected]);

  const chart = metrics ? toSankeyData(metrics) : null;

  return (
    <div className="min-w-0 p-6">
      <div className="relative mb-6 flex items-center justify-center">
        <h1 className="text-2xl font-semibold">Metrics</h1>
        <Link to="/" className="absolute left-0 text-sm text-blue-600 hover:underline dark:text-blue-400">
          ← Back
        </Link>
      </div>

      {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {metrics && chart && (
        <>
          <h2 className="mb-2 text-lg font-medium">Pipeline flow</h2>
          {chart.links.length > 0 ? (
            <div className="mb-2 overflow-x-auto rounded border border-neutral-300 bg-white p-2 dark:border-neutral-700 dark:bg-neutral-900">
              <PipelineSankey
                nodes={chart.nodes}
                links={chart.links}
                height={500}
                onNodeClick={(key, label) => setSelected({ key, label })}
              />
            </div>
          ) : (
            <p className="mb-8 text-sm text-neutral-500 dark:text-neutral-400">
              No pipeline flow yet. It fills in as jobs progress.
            </p>
          )}

          {selected && (
            <div ref={panelRef} className="mb-8 rounded border border-neutral-300 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-800">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-medium">Companies at {selected.label}</p>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
                >
                  ✕
                </button>
              </div>
              {(() => {
                const entries = Object.entries(metrics.companiesByNode?.[selected.key] ?? {});
                return entries.length > 0 ? (
                  <ul className="flex flex-wrap gap-x-5 gap-y-1">
                    {entries.map(([company, count]) => (
                      <li key={company}>
                        {company}
                        {count > 1 ? ` (${count})` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-neutral-500 dark:text-neutral-400">No companies.</p>
                );
              })()}
            </div>
          )}

          <h2 className="mb-3 mt-8 text-lg font-medium">Overview</h2>
          <div className="flex flex-wrap gap-16">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Funnel</h3>
              <table className="text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-neutral-300 px-3 py-1.5 text-left font-medium dark:border-neutral-700">Stage</th>
                    <th className="border-b border-neutral-300 px-3 py-1.5 text-right font-medium dark:border-neutral-700">Jobs reached</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.funnel.map(row => (
                    <tr key={row.stage}>
                      <td className="border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">{STAGE_LABELS[row.stage]}</td>
                      <td className="border-b border-neutral-200 px-3 py-1.5 text-right dark:border-neutral-800">{row.count}</td>
                    </tr>
                  ))}
                  {metrics.outcomeCounts.map(row => (
                    <tr key={row.outcome}>
                      <td className="border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">{OUTCOME_LABELS[row.outcome]}</td>
                      <td className="border-b border-neutral-200 px-3 py-1.5 text-right dark:border-neutral-800">{row.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-neutral-600 dark:text-neutral-300">Interview rounds</h3>
              {metrics.interviewRoundCounts.some(row => row.count > 0) ? (
                <table className="text-sm">
                  <thead>
                    <tr>
                      <th className="border-b border-neutral-300 px-3 py-1.5 text-left font-medium dark:border-neutral-700">Type</th>
                      <th className="border-b border-neutral-300 px-3 py-1.5 text-right font-medium dark:border-neutral-700">Rounds</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.interviewRoundCounts.filter(row => row.count > 0).map(row => (
                      <tr key={row.interviewType}>
                        <td className="border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800">
                          {INTERVIEW_TYPE_LABELS[row.interviewType]}
                        </td>
                        <td className="border-b border-neutral-200 px-3 py-1.5 text-right dark:border-neutral-800">{row.count}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="px-3 py-1.5 font-medium">Total</td>
                      <td className="px-3 py-1.5 text-right font-medium">
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
