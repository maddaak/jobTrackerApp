import { Link } from "react-router-dom";
import type { JobSummary } from "../../api/jobsApi";
import { boardColumnOf, isPendingOffer, isSubmitted } from "../../jobPlacement";

export interface BoardStatsProps {
  jobs: JobSummary[];
  // Before the first load every figure would read 0, which looks like an answer rather than a wait.
  loaded: boolean;
}

interface Stat {
  label: string;
  value: number;
  to?: string;
}

export default function BoardStats({ jobs, loaded }: BoardStatsProps) {
  const now = Date.now();
  const onBoard = jobs.filter(job => boardColumnOf(job) !== null);
  const stats: Stat[] = [
    { label: "On the board", value: onBoard.length },
    {
      label: "Interview scheduled",
      value: onBoard.filter(job => job.latestInterview && new Date(job.latestInterview.interviewDateTime).getTime() > now).length,
    },
    { label: "Waiting on results", value: onBoard.filter(job => job.currentStage === "WAITING_INTERVIEW_RESULTS").length },
    { label: "Submitted, no reply", value: jobs.filter(isSubmitted).length, to: "/submitted" },
    { label: "Offers", value: jobs.filter(isPendingOffer).length, to: "/offers" },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {stats.map(stat => {
        const body = (
          <>
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">{stat.label}</p>
            <p className="text-2xl font-semibold tabular-nums">{loaded ? stat.value : "—"}</p>
          </>
        );
        const className = "block rounded-lg border border-neutral-200 px-4 py-3 dark:border-neutral-800";
        return stat.to ? (
          <Link key={stat.label} to={stat.to} className={`${className} hover:border-blue-400 dark:hover:border-blue-500`}>
            {body}
          </Link>
        ) : (
          <div key={stat.label} className={className}>{body}</div>
        );
      })}
    </div>
  );
}
