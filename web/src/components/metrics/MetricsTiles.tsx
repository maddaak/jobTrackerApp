import { useState } from "react";
import type { Metrics } from "../../api/metricsApi";
import { Link } from "react-router-dom";
import AcceptedOfferModal from "./AcceptedOfferModal";

export interface MetricsTilesProps {
  metrics: Metrics;
}

function percent(part: number, whole: number): string {
  return whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;
}

const tileClass = "rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800";

export default function MetricsTiles({ metrics }: MetricsTilesProps) {
  const [showingAccepted, setShowingAccepted] = useState(false);
  const { summary, funnel, interviewRoundCounts, outcomeCounts } = metrics;
  const reached = (stage: string) => funnel.find(row => row.stage === stage)?.count ?? 0;
  const ended = (outcome: string) => outcomeCounts.find(row => row.outcome === outcome)?.count ?? 0;
  const passed = interviewRoundCounts.reduce((sum, row) => sum + row.passed, 0);
  const notPassed = interviewRoundCounts.reduce((sum, row) => sum + row.notPassed, 0);
  const offers = reached("OFFER_STAGE");
  const accepted = ended("OFFER_ACCEPTED");
  const declined = ended("OFFER_DECLINED");

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
  ];

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {tiles.map(tile => (
        <div key={tile.label} className={tileClass}>
          <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{tile.label}</p>
          <p className="text-2xl font-semibold tabular-nums">{tile.value}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">{tile.detail}</p>
        </div>
      ))}
      <div className={tileClass}>
        <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Offers</p>
        <p className="text-2xl font-semibold tabular-nums">{offers}</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {accepted + declined === 0 ? `${percent(offers, summary.totalJobs)} of applications` : (
            <>
              {accepted} accepted ·{" "}
              {/* There can be many, so they're a section of the Offers page rather than a modal. */}
              {declined > 0
                ? <Link to="/offers#declined" className="hover:text-blue-600 hover:underline dark:hover:text-blue-400">{declined} declined</Link>
                : "0 declined"}
            </>
          )}
        </p>
        {summary.acceptedCompany && (
          <button
            type="button"
            onClick={() => setShowingAccepted(true)}
            title="See the offer you accepted"
            className="mt-1 block max-w-full truncate text-left text-xs font-medium text-emerald-700 hover:underline dark:text-emerald-400"
          >
            Accepted {summary.acceptedCompany}
          </button>
        )}
      </div>
      {showingAccepted && <AcceptedOfferModal onClose={() => setShowingAccepted(false)} />}
    </div>
  );
}
