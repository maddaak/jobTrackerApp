import { useState, type FormEvent } from "react";
import {
  createJob,
  updateJobDetail,
  SOURCE_CATEGORIES,
  SOURCE_CATEGORY_LABELS,
  LOCATIONS,
  type SourceCategory,
  type Location,
} from "../api/jobsApi";
import { scrapeJob, SCRAPE_FAILURE_MESSAGE, type ScrapeFailureReason } from "../api/scrapeApi";
import { matchResumeToJob, type MatchResult } from "../api/resumesApi";
import { useAuth } from "../context/AuthContext";

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium";

type Step = "url" | "form";

export interface AddJobFormProps {
  onCreated: () => void;
  // The attach outlives the form, so its failure needs somewhere to surface that also outlives it.
  onWarning: (message: string) => void;
}

const ATTACH_FAILED =
  "Job created, but its description could not be attached. Open Job Details to paste it.";

export default function AddJobForm({ onCreated, onWarning }: AddJobFormProps) {
  const { aiConfigured } = useAuth();
  const [step, setStep] = useState<Step>("url");
  const [scraping, setScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [scrapedRaw, setScrapedRaw] = useState("");
  const [useAi, setUseAi] = useState(true);

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [sourceCategory, setSourceCategory] = useState<SourceCategory>("SELF_APPLIED");
  const [url, setUrl] = useState("");
  const [location, setLocation] = useState<Location | "">("");
  const [compMin, setCompMin] = useState("");
  const [compMax, setCompMax] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [pastedJdText, setPastedJdText] = useState("");
  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  // "skipped" (expected) vs "fetch_failed" (a problem) sets the manual-paste box's tone.
  const [manualEntryReason, setManualEntryReason] = useState<"skipped" | "fetch_failed" | "insufficient_jd" | null>(null);
  // Why the scrape came back empty, so the paste box can say it instead of a second banner repeating it.
  const [scrapeReason, setScrapeReason] = useState<ScrapeFailureReason | null>(null);

  async function runMatch(jobDescriptionText: string) {
    setMatching(true);
    setMatchResult(null);
    try {
      const result = await matchResumeToJob(jobDescriptionText);
      // Scraped text isn't a real JD; prompt for manual paste instead of a "do not apply" verdict on garbage.
      if (result.status === "insufficient_jd") {
        setManualEntryReason("insufficient_jd");
        return;
      }
      setMatchResult(result);
    } catch {
      setMatchResult({ status: "unavailable" });
    } finally {
      setMatching(false);
    }
  }

  async function handleFetchDetails() {
    if (!url) return;
    setScraping(true);
    setScrapeError(null);
    setScrapeReason(null);
    setMatchResult(null);
    let raw = "";
    let reason: ScrapeFailureReason | undefined;
    try {
      const result = await scrapeJob(url);
      setCompany(result.company);
      setRole(result.role);
      if (result.location) setLocation(result.location);
      if (result.compMin != null) setCompMin(String(result.compMin));
      if (result.compMax != null) setCompMax(String(result.compMax));
      setScrapedRaw(result.raw);
      raw = result.raw;
      // The scraper says why, so a dead link no longer reads like a page with no description.
      // Held as the reason rather than an error banner: the paste box below states it once.
      reason = result.reason;
      setScrapeReason(result.reason ?? null);
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : "couldn't fetch details — fill in manually below");
      setManualEntryReason("fetch_failed");
    } finally {
      setScraping(false);
      setStep("form");
    }
    if (raw) {
      setManualEntryReason(null);
      if (aiConfigured && useAi) runMatch(raw);
    } else {
      // Manual entry either way, but a page with no description isn't one we couldn't fetch.
      setManualEntryReason(reason === "no_job_data" ? "insufficient_jd" : "fetch_failed");
    }
  }

  function handleSkip() {
    setScrapeError(null);
    setScrapeReason(null);
    setMatchResult(null);
    setManualEntryReason("skipped");
    setStep("form");
  }

  // One message, in the paste box that acts on it, rather than a banner and a box saying the same thing.
  const manualJdHeading = scrapeReason
    ? `${SCRAPE_FAILURE_MESSAGE[scrapeReason]} Paste it below for a recommendation.`
    : manualEntryReason === "insufficient_jd"
      ? "This posting didn't include a readable job description. Paste it below for a recommendation."
      : "Couldn't fetch the job description automatically — paste it below for a recommendation.";

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (compMin && compMax && Number(compMin) > Number(compMax)) {
      setError("Comp min can't be greater than comp max.");
      return;
    }
    setSubmitting(true);
    try {
      const job = await createJob({
        company,
        role,
        sourceCategory,
        url: url || undefined,
        location: location || undefined,
        compMin: compMin ? Number(compMin) : undefined,
        compMax: compMax ? Number(compMax) : undefined,
        notes: notes || undefined,
      });
      // Name only, so Job Details can show which resume was recommended.
      const recommendedResume = matchResult && matchResult.status === "ok" ? matchResult.fileName : undefined;
      if (scrapedRaw) {
        // Seed the Job Detail JD text so nothing needs re-pasting later.
        updateJobDetail(job.id, { jdText: scrapedRaw, interviewNotes: "", recommendedResume })
          .catch(() => onWarning(ATTACH_FAILED));
      } else if (url) {
        // URL entered without a Fetch: background scrape to populate the JD text.
        scrapeJob(url)
          .then(result => {
            if (result.raw || recommendedResume) {
              return updateJobDetail(job.id, { jdText: result.raw ?? "", interviewNotes: "", recommendedResume });
            }
          })
          .catch(() => onWarning(ATTACH_FAILED));
      } else if (recommendedResume) {
        updateJobDetail(job.id, { jdText: "", interviewNotes: "", recommendedResume })
          .catch(() => onWarning(ATTACH_FAILED));
      }
      setStep("url");
      setScrapeError(null);
      setScrapeReason(null);
      setScrapedRaw("");
      setCompany("");
      setRole("");
      setUrl("");
      setLocation("");
      setCompMin("");
      setCompMax("");
      setNotes("");
      setPastedJdText("");
      setMatchResult(null);
      setManualEntryReason(null);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to create job");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "url") {
    return (
      <div className="space-y-4">
        <div>
          <label htmlFor="url" className={labelClass}>Job Posting Link</label>
          <input
            id="url"
            autoFocus
            className={inputClass}
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder="https://..."
          />
        </div>
        {aiConfigured ? (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} />
            Use AI and get a recommendation
          </label>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            AI features are disabled: no Anthropic API key found.
          </p>
        )}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleFetchDetails}
            disabled={!url || scraping}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {scraping ? "Fetching…" : "Fetch details"}
          </button>
          <button
            type="button"
            onClick={handleSkip}
            className="text-sm text-neutral-600 hover:underline dark:text-neutral-400"
          >
            Skip — enter manually
          </button>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          No postable link (e.g. a LinkedIn message or email)? Skip and fill in what you know.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {scrapeError && <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">{scrapeError}</p>}
      {/* With AI on, the paste box states the reason; with it off there is no box, so say it here. */}
      {!aiConfigured && scrapeReason && (
        <p role="alert" className="text-sm text-amber-600 dark:text-amber-400">
          {SCRAPE_FAILURE_MESSAGE[scrapeReason]}
        </p>
      )}

      {aiConfigured && (
        <RecommendationPanel
          useAi={useAi}
          manualEntryReason={manualEntryReason}
          manualJdHeading={manualJdHeading}
          hasScrapedRaw={!!scrapedRaw}
          matching={matching}
          matchResult={matchResult}
          pastedJdText={pastedJdText}
          onPastedJdTextChange={setPastedJdText}
          onGetRecommendation={() => runMatch(pastedJdText)}
          onGetRecommendationFromScrape={() => runMatch(scrapedRaw)}
        />
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="company" className={labelClass}>Company</label>
          <input id="company" className={inputClass} value={company} onChange={e => setCompany(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="role" className={labelClass}>Role</label>
          <input id="role" className={inputClass} value={role} onChange={e => setRole(e.target.value)} required />
        </div>
        <div>
          <label htmlFor="sourceCategory" className={labelClass}>Source</label>
          <select
            id="sourceCategory"
            className={inputClass}
            value={sourceCategory}
            onChange={e => setSourceCategory(e.target.value as SourceCategory)}
          >
            {SOURCE_CATEGORIES.map(category => (
              <option key={category} value={category}>{SOURCE_CATEGORY_LABELS[category]}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="location" className={labelClass}>Location</label>
          <select id="location" className={inputClass} value={location} onChange={e => setLocation(e.target.value as Location | "")}>
            <option value="">Not set</option>
            {LOCATIONS.map(loc => (
              <option key={loc.value} value={loc.value}>{loc.label}</option>
            ))}
          </select>
        </div>
        <div className="col-span-2">
          <label htmlFor="url-form" className={labelClass}>Job Posting Link</label>
          <input id="url-form" className={inputClass} value={url} onChange={e => setUrl(e.target.value)} />
        </div>
        <div>
          <label htmlFor="compMin" className={labelClass}>Comp min</label>
          <input id="compMin" type="number" className={inputClass} value={compMin} onChange={e => setCompMin(e.target.value)} />
        </div>
        <div>
          <label htmlFor="compMax" className={labelClass}>Comp max</label>
          <input id="compMax" type="number" className={inputClass} value={compMax} onChange={e => setCompMax(e.target.value)} />
        </div>
        <div className="col-span-2">
          <label htmlFor="notes" className={labelClass}>Notes</label>
          <input id="notes" className={inputClass} value={notes} onChange={e => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add job"}
        </button>
      </div>
    </form>
  );
}

interface RecommendationPanelProps {
  useAi: boolean;
  manualEntryReason: "skipped" | "fetch_failed" | "insufficient_jd" | null;
  manualJdHeading: string;
  hasScrapedRaw: boolean;
  matching: boolean;
  matchResult: MatchResult | null;
  pastedJdText: string;
  onPastedJdTextChange: (value: string) => void;
  onGetRecommendation: () => void;
  onGetRecommendationFromScrape: () => void;
}

function RecommendationPanel({
  useAi, manualEntryReason, manualJdHeading, hasScrapedRaw, matching, matchResult,
  pastedJdText, onPastedJdTextChange, onGetRecommendation, onGetRecommendationFromScrape,
}: RecommendationPanelProps) {
  return (
    <div className="space-y-2">
      {(manualEntryReason === "fetch_failed" || manualEntryReason === "insufficient_jd") && (
        <ManualJdBox
          tone="warning"
          heading={manualJdHeading}
          pastedJdText={pastedJdText}
          onPastedJdTextChange={onPastedJdTextChange}
          onGetRecommendation={onGetRecommendation}
          matching={matching}
        />
      )}

      {manualEntryReason === "skipped" && (
        <ManualJdBox
          tone="suggestion"
          heading="Want a job-fit recommendation? Paste the job description below."
          pastedJdText={pastedJdText}
          onPastedJdTextChange={onPastedJdTextChange}
          onGetRecommendation={onGetRecommendation}
          matching={matching}
        />
      )}

      {manualEntryReason === null && useAi && matching && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">Getting a recommendation…</p>
      )}

      {manualEntryReason === null && !useAi && hasScrapedRaw && !matchResult && (
        <button
          type="button"
          onClick={onGetRecommendationFromScrape}
          disabled={matching}
          className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
        >
          {matching ? "Getting recommendation…" : "Get AI recommendation"}
        </button>
      )}

      {matchResult && <MatchResultBanner result={matchResult} />}
    </div>
  );
}

interface ManualJdBoxProps {
  tone: "warning" | "suggestion";
  heading: string;
  pastedJdText: string;
  onPastedJdTextChange: (value: string) => void;
  onGetRecommendation: () => void;
  matching: boolean;
}

function ManualJdBox({ tone, heading, pastedJdText, onPastedJdTextChange, onGetRecommendation, matching }: ManualJdBoxProps) {
  const boxClass =
    tone === "warning"
      ? "rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-800 dark:bg-amber-950/30"
      : "rounded border border-neutral-300 bg-neutral-50 p-3 text-sm dark:border-neutral-700 dark:bg-neutral-800";
  const headingClass =
    tone === "warning"
      ? "mb-2 font-medium text-amber-800 dark:text-amber-300"
      : "mb-2 font-medium text-neutral-700 dark:text-neutral-300";

  return (
    <div className={boxClass}>
      <p className={headingClass}>{heading}</p>
      <label htmlFor="pasted-jd" className={labelClass}>Paste the job description</label>
      <textarea
        id="pasted-jd"
        rows={4}
        className={inputClass}
        value={pastedJdText}
        onChange={e => onPastedJdTextChange(e.target.value)}
      />
      <button
        type="button"
        onClick={onGetRecommendation}
        disabled={!pastedJdText.trim() || matching}
        className="mt-2 rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {matching ? "Getting recommendation…" : "Get recommendation"}
      </button>
    </div>
  );
}

function MatchResultBanner({ result }: { result: MatchResult }) {
  if (result.status === "ok") {
    const isApply = result.recommendation === "APPLY";
    return (
      <div
        className={
          isApply
            ? "rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-300"
            : "rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-300"
        }
      >
        {isApply ? "✓ You should apply" : "⚠ You should not apply"} — best fit:{" "}
        <strong>{result.fileName}</strong>. {result.reasoning}
      </div>
    );
  }

  const message =
    result.status === "no_resumes"
      ? "No analyzed resumes yet — upload one on the Resumes page."
      : result.status === "not_configured"
        ? "Connect an Anthropic API key to get recommendations."
        : "Recommendation unavailable right now — try again.";

  return (
    <div className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      {message}
    </div>
  );
}
