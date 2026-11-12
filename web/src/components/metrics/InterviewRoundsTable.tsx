import { useState } from "react";
import Modal from "../Modal";
import { INTERVIEW_TYPE_LABELS } from "../../api/interviewsApi";
import type { InterviewRoundCount, RoundJobRef } from "../../api/metricsApi";

export interface InterviewRoundsTableProps {
  rows: InterviewRoundCount[];
  labelFor: (roundNode: string) => string;
}

// Only decided rounds count: an open pipeline has not judged a round, and withdrawing or the req
// closing says nothing about how it went. Blank rather than 0% when nothing is decided yet.
function formatPassRate(row: Pick<InterviewRoundCount, "passed" | "notPassed">): string {
  const decided = row.passed + row.notPassed;
  return decided === 0 ? "—" : `${Math.round((row.passed / decided) * 100)}%`;
}

// Red only once there is enough to read: one lost round out of one is not a weakness yet.
function passRateClass(row: Pick<InterviewRoundCount, "passed" | "notPassed">): string {
  const decided = row.passed + row.notPassed;
  if (decided < 3) return "";
  return row.passed / decided < 0.5 ? "font-medium text-red-700 dark:text-red-400" : "";
}

interface RoundCountCellProps {
  label: string;
  verdictLabel: string;
  value: number;
  onOpen: () => void;
}

// Zero opens nothing, so it stays plain text rather than a button that does nothing when pressed.
function RoundCountCell({ label, verdictLabel, value, onOpen }: RoundCountCellProps) {
  if (value === 0) return <>0</>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Show the ${value} ${label} rounds ${verdictLabel}`}
      title={`See which jobs ${verdictLabel === "passed" ? "you passed" : "you didn't pass"}`}
      className="-mx-1 rounded px-1 underline decoration-dotted underline-offset-2 hover:bg-neutral-100 hover:decoration-solid dark:hover:bg-neutral-800"
    >
      {value}
    </button>
  );
}

type RoundVerdict = "passed" | "notPassed";

const JOBS_BY_VERDICT: Record<RoundVerdict, (row: InterviewRoundCount) => RoundJobRef[]> = {
  passed: row => row.passedJobs,
  notPassed: row => row.notPassedJobs,
};

type RoundDetail = { row: InterviewRoundCount; verdict: RoundVerdict };

const VERDICT_LABELS = {
  passed: "passed",
  notPassed: "not passed",
} as const;

interface RoundDetailModalProps {
  detail: RoundDetail | null;
  labelFor: (roundNode: string) => string;
  onClose: () => void;
}

function RoundDetailModal({ detail, labelFor, onClose }: RoundDetailModalProps) {
  const jobs = detail ? JOBS_BY_VERDICT[detail.verdict](detail.row) : [];
  const title = detail ? `${labelFor(detail.row.roundNode)} — ${VERDICT_LABELS[detail.verdict]}` : "";

  return (
    <Modal open={detail !== null} onClose={onClose} title={title}>
      {jobs.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No jobs to show.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {jobs.map(job => (
            <li key={job.jobId} className="rounded border border-neutral-200 px-2 py-1.5 dark:border-neutral-700">
              <div className="flex items-center justify-between gap-3">
                {/* The role is the tooltip, not the label: two postings at one company look identical otherwise. */}
                <span className="truncate font-medium" title={job.role}>{job.company}</span>
                {job.times > 1 && (
                  <span className="shrink-0 text-xs text-neutral-500 dark:text-neutral-400">
                    {job.times} times
                  </span>
                )}
              </div>
              {job.components.length > 0 && (
                <ol className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-neutral-500 dark:text-neutral-400">
                  {job.components.map((type, index) => (
                    <li key={`${type}-${index}`}>
                      {INTERVIEW_TYPE_LABELS[type].replace(/^Panel - /, "")}
                      {index < job.components.length - 1 && " ·"}
                    </li>
                  ))}
                </ol>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

const headerClass = "border-b border-neutral-300 px-3 py-1.5 font-medium dark:border-neutral-700";
const cellClass = "border-b border-neutral-200 px-3 py-1.5 dark:border-neutral-800";

export default function InterviewRoundsTable({ rows, labelFor }: InterviewRoundsTableProps) {
  const [detail, setDetail] = useState<RoundDetail | null>(null);
  const faced = rows.filter(row => row.count > 0);

  if (faced.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">No interview rounds scheduled yet.</p>;
  }

  return (
    <>
      <table className="text-sm">
        <thead>
          <tr>
            <th className={`${headerClass} text-left`}>Type</th>
            <th
              className={`${headerClass} text-right`}
              title="How many times you faced this. A panel counts once, however many interviews it held."
            >
              Times
            </th>
            <th className={`${headerClass} text-right`}>Passed</th>
            <th className={`${headerClass} text-right`}>Not passed</th>
            <th
              className={`${headerClass} text-right`}
              title="Passed as a share of the rounds that were decided. Rounds still in play, withdrawn, or on a closed req are not counted either way."
            >
              Pass rate
            </th>
          </tr>
        </thead>
        <tbody>
          {faced.map(row => (
            <tr key={row.roundNode}>
              <td className={cellClass}>{labelFor(row.roundNode)}</td>
              <td className={`${cellClass} text-right`}>{row.count}</td>
              <td className={`${cellClass} text-right text-green-700 dark:text-green-400`}>
                <RoundCountCell
                  label={labelFor(row.roundNode)}
                  verdictLabel="passed"
                  value={row.passed}
                  onOpen={() => setDetail({ row, verdict: "passed" })}
                />
              </td>
              <td className={`${cellClass} text-right text-red-700 dark:text-red-400`}>
                <RoundCountCell
                  label={labelFor(row.roundNode)}
                  verdictLabel="not passed"
                  value={row.notPassed}
                  onOpen={() => setDetail({ row, verdict: "notPassed" })}
                />
              </td>
              <td className={`${cellClass} text-right ${passRateClass(row)}`}>{formatPassRate(row)}</td>
            </tr>
          ))}
          <tr>
            <td className="px-3 py-1.5 font-medium">Total</td>
            <td className="px-3 py-1.5 text-right font-medium">{rows.reduce((sum, row) => sum + row.count, 0)}</td>
            <td className="px-3 py-1.5 text-right font-medium text-green-700 dark:text-green-400">
              {rows.reduce((sum, row) => sum + row.passed, 0)}
            </td>
            <td className="px-3 py-1.5 text-right font-medium text-red-700 dark:text-red-400">
              {rows.reduce((sum, row) => sum + row.notPassed, 0)}
            </td>
            <td className="px-3 py-1.5" />
          </tr>
        </tbody>
      </table>
      <RoundDetailModal detail={detail} labelFor={labelFor} onClose={() => setDetail(null)} />
    </>
  );
}
