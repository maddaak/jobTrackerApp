import { useEffect, useState } from "react";
import AiPanel, { TitledList } from "../ai/AiPanel";
import { clearInsights, getInsights, runInsights, type AiResult, type Insights } from "../../api/aiApi";

// What stands out across the whole search, from the counts this page shows plus the rejection reasons.
export default function InsightsPanel({ totalJobs }: { totalJobs: number }) {
  const [insights, setInsights] = useState<AiResult<Insights> | null>(null);

  useEffect(() => {
    let ignore = false;
    getInsights()
      .then(saved => { if (!ignore) setInsights(saved); })
      .catch(() => {});
    return () => { ignore = true; };
  }, []);

  const then = insights?.content.jobCount;
  const staleNote = then !== undefined && then !== totalJobs
    ? `Based on ${then} ${then === 1 ? "job" : "jobs"}; you have ${totalJobs} now. Run it again to include them.`
    : null;

  return (
    <AiPanel
      title="Patterns"
      about="Reads your funnel, outcomes, round results, how you applied, and your rejection reasons, and says what stands out. Sends counts and your rejection reasons as you wrote them, never company names. Billed by your AI provider."
      runLabel="Find patterns in my search"
      busyLabel="Looking for patterns…"
      result={insights}
      run={runInsights}
      remove={clearInsights}
      onChange={setInsights}
      staleNote={staleNote}
    >
      {content => (
        <>
          <p>{content.summary}</p>
          {content.patterns.length > 0 && (
            <ul className="space-y-1">
              {content.patterns.map((pattern, i) => (
                <li key={i}><span className="font-medium">{pattern.title}.</span> {pattern.detail}</li>
              ))}
            </ul>
          )}
          <TitledList title="What to try" items={content.nextSteps} />
        </>
      )}
    </AiPanel>
  );
}
