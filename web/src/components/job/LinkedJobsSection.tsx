import { useState } from "react";
import {
  JOB_RELATION_LABELS,
  JOB_RELATIONS,
  linkJob,
  unlinkJob,
  type JobLink,
  type JobRelation,
  type JobSummary,
} from "../../api/jobsApi";

export interface LinkedJobsSectionProps {
  job: JobSummary;
  allJobs: JobSummary[];
  links: JobLink[];
  onLinksChange: (links: JobLink[]) => void;
  onError: (message: string) => void;
  onChanged: () => void;
}

const selectClass =
  "w-auto rounded border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";

export default function LinkedJobsSection({ job, allJobs, links, onLinksChange, onError, onChanged }: LinkedJobsSectionProps) {
  const [relation, setRelation] = useState<JobRelation>("REPLACED_BY");
  const [targetId, setTargetId] = useState("");
  const [linking, setLinking] = useState(false);

  // Drop already-linked jobs: re-picking one would silently overwrite its relation.
  const linkableJobs = allJobs.filter(other => other.id !== job.id && !links.some(link => link.jobId === other.id));

  // Reports success so a failed link keeps the picker's selection to retry with.
  async function runLinkChange(change: () => Promise<JobLink[]>) {
    setLinking(true);
    try {
      onLinksChange(await change());
      onChanged();
      return true;
    } catch (err) {
      onError(err instanceof Error ? err.message : "failed to update linked jobs");
      return false;
    } finally {
      setLinking(false);
    }
  }

  return (
    <div>
      <p className="mb-1 block text-sm font-medium">Linked jobs</p>
      {links.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No linked jobs yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {links.map(link => (
            <li
              key={link.jobId}
              className="flex items-center justify-between gap-2 rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700"
            >
              <span className="truncate" title={`${link.company} — ${link.role}`}>
                <span className="text-neutral-500 dark:text-neutral-400">{JOB_RELATION_LABELS[link.relation]}</span>{" "}
                {link.company} — {link.role}
              </span>
              <button
                type="button"
                disabled={linking}
                onClick={() => runLinkChange(() => unlinkJob(job.id, link.jobId))}
                className="shrink-0 text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      )}
      {linkableJobs.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select aria-label="Relation" className={selectClass} value={relation} onChange={e => setRelation(e.target.value as JobRelation)}>
            {JOB_RELATIONS.map(option => (
              <option key={option} value={option}>{JOB_RELATION_LABELS[option]}</option>
            ))}
          </select>
          <select
            aria-label="Job to link"
            className={`${selectClass} max-w-xs`}
            value={targetId}
            onChange={e => setTargetId(e.target.value)}
          >
            <option value="">Select a job…</option>
            {linkableJobs.map(other => (
              <option key={other.id} value={other.id}>{other.company} — {other.role}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={linking || targetId === ""}
            onClick={() => runLinkChange(() => linkJob(job.id, Number(targetId), relation)).then(ok => ok && setTargetId(""))}
            className="rounded border border-neutral-300 px-3 py-2 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            Link
          </button>
        </div>
      )}
    </div>
  );
}
