import { useEffect, useState } from "react";
import AiPanel, { TitledList } from "./AiPanel";
import CompanyBriefPanel from "./CompanyBriefPanel";
import EmailDraftView from "./EmailDraftView";
import InterviewPrepPanel from "./InterviewPrepPanel";
import { clearJobResult, runFollowUp, runTailoring, type JobAiResults } from "../../api/aiApi";
import type { JobSummary } from "../../api/jobsApi";
import { listResumes, type ResumeSummary } from "../../api/resumesApi";

export interface JobAiPanelsProps {
  job: JobSummary;
  results: JobAiResults;
  // An update to apply to the latest results, so two panels finishing at once both keep their answer.
  onChange: (update: (results: JobAiResults) => JobAiResults) => void;
}

const selectClass =
  "rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-900";

// The job-level AI features in Job details. A follow-up only fits once there's been an interview to follow.
export default function JobAiPanels({ job, results, onChange }: JobAiPanelsProps) {
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  // Empty means the one recommended when the job was added, else the newest.
  const [resumeId, setResumeId] = useState("");

  useEffect(() => {
    let ignore = false;
    listResumes()
      .then(loaded => { if (!ignore) setResumes(loaded); })
      .catch(() => {});
    return () => { ignore = true; };
  }, []);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">AI help</p>
      <CompanyBriefPanel company={job.company} role={job.role} />
      <InterviewPrepPanel job={job} results={results} onChange={onChange} />

      <AiPanel
        title="Resume tailoring"
        about="Specific bullet changes and missing keywords for this job's description. It never invents experience. Billed by your AI provider."
        runLabel="Tailor my resume to this job"
        busyLabel="Comparing…"
        result={results.tailoring ?? null}
        canRun={resumes.length > 0}
        run={() => runTailoring(job.id, resumeId || undefined)}
        remove={() => clearJobResult(job.id, "tailoring")}
        onChange={tailoring => onChange(current => ({ ...current, tailoring: tailoring ?? undefined }))}
        inputs={resumes.length === 0 ? (
          <p className="text-xs text-neutral-500 dark:text-neutral-400">Upload a resume on the Resumes page first.</p>
        ) : (
          <label className="flex items-center gap-2 text-xs">
            Resume
            <select className={selectClass} value={resumeId} onChange={e => setResumeId(e.target.value)}>
              <option value="">Recommended, or the newest</option>
              {resumes.map(resume => <option key={resume.id} value={resume.id}>{resume.fileName}</option>)}
            </select>
          </label>
        )}
      >
        {content => (
          <>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">For {content.resumeFileName}</p>
            <p>{content.summary}</p>
            <TitledList title="Keywords to work in" items={content.keywordsToAdd} />
            {content.bulletChanges.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Bullet changes</p>
                {content.bulletChanges.map((change, i) => (
                  <div key={i} className="rounded bg-neutral-50 p-2 dark:bg-neutral-800">
                    <p className="text-neutral-500 line-through dark:text-neutral-400">{change.current}</p>
                    <p className="mt-1">{change.suggested}</p>
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{change.why}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </AiPanel>

      {(job.latestInterview || results["follow-up"]) && (
        <AiPanel
          title="Follow-up email"
          about="A short note to the recruiter after your last round, using its debrief when there is one. Billed by your AI provider."
          runLabel="Draft a follow-up"
          busyLabel="Drafting…"
          result={results["follow-up"] ?? null}
          run={() => runFollowUp(job.id)}
          remove={() => clearJobResult(job.id, "follow-up")}
          onChange={draft => onChange(current => ({ ...current, "follow-up": draft ?? undefined }))}
        >
          {content => <EmailDraftView draft={content} />}
        </AiPanel>
      )}
    </div>
  );
}
