import { useEffect, useState } from "react";
import AiPanel, { TitledList } from "./AiPanel";
import { clearCompanyBrief, getCompanyBrief, runCompanyBrief, type AiResult, type CompanyBrief } from "../../api/aiApi";

// Waits for typing to settle before looking up a saved brief, since the Add Job form passes every keystroke.
const LOOKUP_DELAY_MS = 400;

export default function CompanyBriefPanel({ company, role }: { company: string; role: string }) {
  // Tagged with its company, so a run that finishes after the name was edited can't show under the new one.
  const [brief, setBrief] = useState<{ company: string; result: AiResult<CompanyBrief> | null }>({ company: "", result: null });
  const name = company.trim();

  function showFor(company: string, result: AiResult<CompanyBrief> | null) {
    setBrief(current => (current.company === company ? { company, result } : current));
  }

  useEffect(() => {
    let ignore = false;
    setBrief({ company: name, result: null });
    if (!name) return;
    const timer = setTimeout(() => {
      getCompanyBrief(name)
        .then(saved => { if (!ignore) showFor(name, saved); })
        // No saved brief to show is no different from never having run one.
        .catch(() => {});
    }, LOOKUP_DELAY_MS);
    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [name]);

  return (
    <AiPanel
      title="Company brief"
      about="What the company does, its size and funding, recent news such as layoffs, and what candidates say about interviewing there. Kept per company and billed by your AI provider."
      runLabel={name ? `Brief me on ${name}` : "Brief me on this company"}
      busyLabel="Researching the company…"
      result={brief.company === name ? brief.result : null}
      canRun={!!name}
      run={() => runCompanyBrief(name, role.trim())}
      remove={() => clearCompanyBrief(name)}
      onChange={result => showFor(name, result)}
    >
      {content => (
        <>
          <p>{content.overview}</p>
          <TitledList title="Facts" items={content.facts} />
          <TitledList title="Recent news" items={content.recentNews} />
          {content.interviewProcess && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">Interviewing there</p>
              <p className="mt-1">{content.interviewProcess}</p>
            </div>
          )}
          <TitledList title="Worth asking about" items={content.watchOuts} />
        </>
      )}
    </AiPanel>
  );
}
