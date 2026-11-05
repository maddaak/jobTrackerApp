import { useState } from "react";
import AiPanel, { CopyButton, TitledList } from "./AiPanel";
import { clearRoundResult, runDebrief, type RoundAiResults } from "../../api/aiApi";
import type { Interview } from "../../api/interviewsApi";

const MAX_NOTES = 10_000;

const textareaClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";

export interface RoundAiPanelsProps {
  round: Interview;
  onChange: (results: RoundAiResults) => void;
}

// A debrief after a round, saved on the round itself. Prep is per kind of round, in the job's AI help.
export default function RoundAiPanels({ round, onChange }: RoundAiPanelsProps) {
  const results = round.aiResults ?? {};
  const [notes, setNotes] = useState(results.debrief?.content.notes ?? "");

  return (
    <div className="space-y-2">
      <AiPanel
        title="Debrief"
        about="Paste rough notes from the round. You get a clean summary, a thank-you email to send, and anything you said you'd follow up on. Billed by your AI provider."
        runLabel="Write the debrief"
        busyLabel="Writing…"
        result={results.debrief ?? null}
        canRun={notes.trim() !== "" && notes.length <= MAX_NOTES}
        run={() => runDebrief(round.roundId, notes)}
        remove={() => clearRoundResult(round.roundId, "debrief")}
        onChange={debrief => onChange({ ...results, debrief: debrief ?? undefined })}
        inputs={
          <textarea
            aria-label="Your notes from the round"
            rows={4}
            maxLength={MAX_NOTES}
            className={textareaClass}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Who you met, what they asked, how it went, anything you promised to send…"
          />
        }
      >
        {content => (
          <>
            <p>{content.summary}</p>
            <div>
              <div className="flex items-center gap-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Thank-you email</p>
                <CopyButton text={content.thankYouNote} />
              </div>
              <p className="mt-1 whitespace-pre-line rounded bg-neutral-50 p-2 dark:bg-neutral-800">{content.thankYouNote}</p>
            </div>
            <TitledList title="Follow up on" items={content.followUps} />
          </>
        )}
      </AiPanel>
    </div>
  );
}
