import { useState } from "react";
import AiPanel, { TitledList, linkClass } from "./AiPanel";
import { clearPrep, runPrep, type JobAiResults, type PrepKey } from "../../api/aiApi";
import { INTERVIEW_TYPES, INTERVIEW_TYPE_LABELS, type InterviewType } from "../../api/interviewsApi";
import type { JobSummary } from "../../api/jobsApi";
import { safeHref } from "../../safeHref";

export interface InterviewPrepPanelProps {
  job: JobSummary;
  results: JobAiResults;
  onChange: (update: (results: JobAiResults) => JobAiResults) => void;
}

const selectClass =
  "rounded border border-neutral-300 bg-white px-2 py-0.5 text-xs dark:border-neutral-600 dark:bg-neutral-900";
const headingClass = "text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400";
const textareaClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const MAX_NOTES = 10_000;

// Prep per kind of round, kept for each, so it can be read before the round is even booked. Starts on the
// job's latest round, since that's usually the one coming up.
export default function InterviewPrepPanel({ job, results, onChange }: InterviewPrepPanelProps) {
  const saved = INTERVIEW_TYPES.filter(type => results[`prep:${type}`]);
  const [type, setType] = useState<InterviewType>(job.latestInterview?.interviewType ?? saved[0] ?? "RECRUITER_PHONE_SCREEN");
  const key: PrepKey = `prep:${type}`;
  const [notes, setNotes] = useState(results[key]?.content.recruiterNotes ?? "");

  // Each kind's prep was made from its own notes, so switching shows those.
  function chooseType(next: InterviewType) {
    setType(next);
    setNotes(results[`prep:${next}`]?.content.recruiterNotes ?? "");
  }

  return (
    <AiPanel
      key={type}
      title="Interview prep"
      about="Practice links for this kind of round (coding problems, design primers, or question banks for your field), topics to review, likely questions, and stories from your resume. Searches the web. Billed by your AI provider."
      runLabel="Prepare me"
      busyLabel="Preparing…"
      result={results[key] ?? null}
      run={() => runPrep(job.id, type, notes)}
      canRun={notes.length <= MAX_NOTES}
      remove={() => clearPrep(job.id, type)}
      onChange={prep => onChange(current => ({ ...current, [key]: prep ?? undefined }))}
      inputs={
        <textarea
          aria-label="What the recruiter said about this round"
          rows={3}
          maxLength={MAX_NOTES}
          className={textareaClass}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional: paste what the recruiter sent, such as the format, length, topics, or tools."
        />
      }
      controls={
        <select aria-label="Kind of interview" className={selectClass} value={type} onChange={e => chooseType(e.target.value as InterviewType)}>
          {INTERVIEW_TYPES.map(option => (
            <option key={option} value={option}>
              {INTERVIEW_TYPE_LABELS[option]}{saved.includes(option) ? " (saved)" : ""}
            </option>
          ))}
        </select>
      }
    >
      {content => (
        <>
          <p>{content.focus}</p>
          {content.recruiterNotes && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Built around what the recruiter said.</p>
          )}
          {content.practice.length > 0 && (
            <div>
              <p className={headingClass}>Practice</p>
              <ul className="mt-1 space-y-1">
                {content.practice.map(item => {
                  const href = safeHref(item.url);
                  return (
                    <li key={item.url}>
                      {href
                        ? <a href={href} target="_blank" rel="noreferrer" className={linkClass}>{item.title} ↗</a>
                        : item.title}
                      {item.why && <span className="text-neutral-500 dark:text-neutral-400"> · {item.why}</span>}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
          <TitledList title="Topics to review" items={content.topics} />
          <TitledList title="Likely questions" items={content.likelyQuestions} />
          <TitledList title="Stories to lead with" items={content.storiesToTell} />
          <TitledList title="Questions to ask them" items={content.questionsToAsk} />
          {content.resumeFileName && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">Stories from {content.resumeFileName}.</p>
          )}
        </>
      )}
    </AiPanel>
  );
}
