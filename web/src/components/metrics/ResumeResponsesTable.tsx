import type { ResumeResponseRate } from "../../api/metricsApi";

// A handful of applications says little, so small samples are marked rather than ranked as if they meant much.
const FEW_APPLICATIONS = 5;

export default function ResumeResponsesTable({ rows }: { rows: ResumeResponseRate[] }) {
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-500 dark:text-neutral-400">
            <th className="py-1 font-medium">Resume</th>
            <th className="py-1 text-right font-medium">Sent</th>
            <th className="py-1 text-right font-medium">Replies</th>
            <th className="py-1 text-right font-medium">Reply rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.resume} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="max-w-0 truncate py-1" title={row.resume}>{row.resume}</td>
              <td className="py-1 text-right tabular-nums">{row.applications}</td>
              <td className="py-1 text-right tabular-nums">{row.responses}</td>
              <td className="py-1 text-right tabular-nums">
                {Math.round((row.responses / row.applications) * 100)}%
                {row.applications < FEW_APPLICATIONS && <span className="text-neutral-400" title="Too few to compare yet"> *</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
        A reply is a recruiter reaching out or anything further. Only jobs where you recorded the resume you sent.
        {rows.some(row => row.applications < FEW_APPLICATIONS) && ` * Fewer than ${FEW_APPLICATIONS} sent, too few to compare yet.`}
      </p>
    </div>
  );
}
