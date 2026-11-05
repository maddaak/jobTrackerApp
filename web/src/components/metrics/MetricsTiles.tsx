import type { Metrics } from "../../api/metricsApi";

export interface MetricsTilesProps {
  metrics: Metrics;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
}

export default function MetricsTiles({ metrics }: MetricsTilesProps) {
  const { summary, funnel, interviewRoundCounts } = metrics;
  const reached = (stage: string) => funnel.find(row => row.stage === stage)?.count ?? 0;
  const passed = interviewRoundCounts.reduce((sum, row) => sum + row.passed, 0);
  const notPassed = interviewRoundCounts.reduce((sum, row) => sum + row.notPassed, 0);

  const tiles = [
    { label: "Applications", value: String(summary.totalJobs), detail: `${summary.activeJobs} still active` },
    {
      label: "Response rate",
      value: percent(reached("INTERVIEW_REQUEST"), summary.totalJobs),
      detail: `${reached("INTERVIEW_REQUEST")} heard back`,
    },
    { label: "In interviews", value: String(summary.inInterviews), detail: "on the board now" },
    {
      label: "Interviews",
      value: String(summary.interviewsDone),
      detail: `${summary.interviewsUpcoming} upcoming`,
    },
    // Decided rounds only, matching the rounds table: undecided ones are neither a pass nor a loss.
    { label: "Round pass rate", value: percent(passed, passed + notPassed), detail: `${passed + notPassed} decided` },
    {
      label: "Offers",
      value: String(reached("OFFER_STAGE")),
      detail: `${percent(reached("OFFER_STAGE"), summary.totalJobs)} of applications`,
    },
  ];

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map(tile => (
        <div key={tile.label} className="rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{tile.label}</p>
          <p className="text-2xl font-semibold tabular-nums">{tile.value}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{tile.detail}</p>
        </div>
      ))}
    </div>
  );
}
