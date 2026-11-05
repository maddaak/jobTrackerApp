import { useCallback, useEffect, useState } from "react";
import InterviewFormModal, { type InterviewFormMode } from "../InterviewFormModal";
import RoundAiPanels from "../ai/RoundAiPanels";
import type { RoundAiResults } from "../../api/aiApi";
import { useAuth } from "../../hooks/useAuth";
import { INTERVIEW_TYPE_LABELS, listInterviews, type Interview } from "../../api/interviewsApi";
import { formatFullDateTimeRange } from "../../interviewTimes";
import { downloadIcs } from "../../calendarFile";
import { safeHref } from "../../safeHref";

export interface InterviewRoundsSectionProps {
  jobId: number;
  onError: (message: string) => void;
  onChanged: () => void;
}

export default function InterviewRoundsSection({ jobId, onError, onChanged }: InterviewRoundsSectionProps) {
  const [rounds, setRounds] = useState<Interview[]>([]);
  const [formMode, setFormMode] = useState<InterviewFormMode | null>(null);
  const [openAi, setOpenAi] = useState<string | null>(null);
  const { aiConfigured } = useAuth();

  function setRoundResults(roundId: string, aiResults: RoundAiResults) {
    setRounds(current => current.map(round => (round.roundId === roundId ? { ...round, aiResults } : round)));
  }

  const load = useCallback((isStale: () => boolean) => {
    listInterviews()
      .then(all => {
        if (isStale()) return;
        setRounds(
          all
            .filter(round => round.jobId === jobId)
            .sort((a, b) => a.interviewDateTime.localeCompare(b.interviewDateTime)),
        );
      })
      .catch(err => {
        if (!isStale()) onError(err instanceof Error ? err.message : "failed to load interview rounds");
      });
  }, [jobId, onError]);

  useEffect(() => {
    // Ignore a response that resolves after the user switched jobs, else A's rounds show on B.
    let ignore = false;
    setRounds([]);
    load(() => ignore);
    return () => { ignore = true; };
  }, [load]);

  // A new round can move the card (core advances its stage), so the page reloads too.
  function handleRoundsChanged() {
    setFormMode(null);
    load(() => false);
    onChanged();
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-medium">Interview rounds</p>
        <button
          type="button"
          onClick={() => setFormMode({ kind: "create", jobId })}
          className="text-xs text-blue-600 hover:underline dark:text-blue-400"
        >
          + Add round
        </button>
      </div>
      {rounds.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">No interview rounds yet.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {rounds.map((round, i) => (
            <li key={round.roundId} className="rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700">
              <div className="flex items-start justify-between gap-2">
                <span>
                  <span className="font-medium">Round {i + 1}:</span>{" "}
                  {formatFullDateTimeRange(round.interviewDateTime, round.interviewEndDateTime)}
                  {round.interviewType && ` · ${INTERVIEW_TYPE_LABELS[round.interviewType]}`}
                  {round.interviewers.length > 0 && (
                    <span className="text-neutral-500 dark:text-neutral-400">
                      {" · "}{round.interviewers.map(iv => iv.name).join(", ")}
                    </span>
                  )}
                  {safeHref(round.meetingLink) && (
                    <>
                      {" · "}
                      <a
                        href={safeHref(round.meetingLink)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Join ↗
                      </a>
                    </>
                  )}
                </span>
                <span className="flex shrink-0 gap-3 text-xs">
                  {new Date(round.interviewEndDateTime ?? round.interviewDateTime).getTime() > Date.now() && (
                    <button
                      type="button"
                      aria-label={`Add round ${i + 1} to your calendar`}
                      title="Download a file your calendar app opens"
                      onClick={() => downloadIcs(`${round.company.replace(/[^\w]+/g, "-")}-round-${i + 1}.ics`, [round])}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Add to calendar
                    </button>
                  )}
                  {aiConfigured && (
                    <button
                      type="button"
                      aria-expanded={openAi === round.roundId}
                      aria-label={`Debrief for round ${i + 1}`}
                      onClick={() => setOpenAi(open => (open === round.roundId ? null : round.roundId))}
                      className="text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Debrief
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label={`Edit round ${i + 1}`}
                    onClick={() => setFormMode({ kind: "edit", interview: round })}
                    className="text-blue-600 hover:underline dark:text-blue-400"
                  >
                    Edit
                  </button>
                </span>
              </div>
              {openAi === round.roundId && (
                <div className="mt-2">
                  <RoundAiPanels round={round} onChange={results => setRoundResults(round.roundId, results)} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      <InterviewFormModal
        mode={formMode}
        onClose={() => setFormMode(null)}
        onSaved={handleRoundsChanged}
        onDeleted={handleRoundsChanged}
      />
    </div>
  );
}
