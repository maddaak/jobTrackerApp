import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  createJob,
  updateJobDetail,
  SOURCE_CATEGORIES,
  SOURCE_CATEGORY_LABELS,
  LOCATIONS,
  type SourceCategory,
  type Location,
  type CreatedJob,
} from "../api/jobsApi";
import { readPastedJob, scrapeJob, SCRAPE_FAILURE_MESSAGE, type ScrapeFailureReason } from "../api/scrapeApi";
import { listResumes, matchResumeToJob, type MatchResult } from "../api/resumesApi";
import { useAuth } from "../hooks/useAuth";
import type { SavedPosting } from "../postingMessage";
import CompanyBriefPanel from "./ai/CompanyBriefPanel";
import SaveToJobTrackerButton from "./SaveToJobTrackerButton";

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium";
const hintClass = "text-xs text-neutral-500 dark:text-neutral-400";

type Step = "url" | "form";

// Why the description box is empty when a link was given; null when it holds the fetched text or was skipped.
type MissingJd = { kind: "scrape"; reason: ScrapeFailureReason } | { kind: "fetch_failed" } | { kind: "not_a_jd" };

const MISSING_JD_MESSAGE = (missing: MissingJd) =>
  missing.kind === "scrape"
    ? SCRAPE_FAILURE_MESSAGE[missing.reason]
    : missing.kind === "fetch_failed"
      ? "Couldn't fetch the job description automatically."
      : "This posting didn't include a readable job description.";

export interface AddJobFormProps {
  // Sent by the bookmarklet from a job page: the form opens on it with the description already in.
  posting?: SavedPosting | null;
  // Handed the new job, so the caller can say where it landed.
  onCreated: (job: CreatedJob) => void;
  // The attach outlives the form, so its failure needs somewhere to surface that also outlives it.
  onWarning: (message: string) => void;
}

const ATTACH_FAILED =
  "Job created, but its description could not be attached. Open Job Details to paste it.";

export default function AddJobForm({ posting, onCreated, onWarning }: AddJobFormProps) {
  const { aiConfigured } = useAuth();
  const [step, setStep] = useState<Step>(posting ? "form" : "url");
  const [scraping, setScraping] = useState(false);
  const [useAi, setUseAi] = useState(true);

  const [company, setCompany] = useState("");
  const [role, setRole] = useState(posting?.title ?? "");
  const [sourceCategory, setSourceCategory] = useState<SourceCategory>("SELF_APPLIED");
  const [url, setUrl] = useState(posting?.url ?? "");
  const [location, setLocation] = useState<Location | "">("");
  const [city, setCity] = useState("");
  const [compMin, setCompMin] = useState("");
  const [compMax, setCompMax] = useState("");
  const [notes, setNotes] = useState("");
  const [recruiterReachedOut, setRecruiterReachedOut] = useState(false);
  // One description whichever way it arrived: fetched from the link, pasted, or corrected by hand.
  const [jdText, setJdText] = useState(posting?.text ?? "");
  const [missingJd, setMissingJd] = useState<MissingJd | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [filling, setFilling] = useState(false);
  const [fillNote, setFillNote] = useState<string | null>(null);

  const [matching, setMatching] = useState(false);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  // Bumped by each match and by each new job, so a slow answer for job A can't land on job B's form.
  const matchRequestId = useRef(0);
  // Null until known. The match call refuses without one anyway, but saying so up front beats after a fetch.
  const [hasAnalyzedResume, setHasAnalyzedResume] = useState<boolean | null>(null);

  useEffect(() => {
    if (!aiConfigured) return;
    let ignore = false;
    listResumes()
      .then(resumes => {
        if (!ignore) setHasAnalyzedResume(resumes.some(resume => resume.analysisStatus === "ok" && !!resume.summary));
      })
      // Unknown, so the option stays on and the match call reports a missing resume itself.
      .catch(() => {});
    return () => { ignore = true; };
  }, [aiConfigured]);

  const canRecommend = aiConfigured && hasAnalyzedResume !== false;

  // Reading the title, location, and pay costs nothing, so a saved posting gets it straight away. The
  // recommendation waits for a press, since that one is billed.
  const postingRead = useRef(!posting?.text);
  useEffect(() => {
    if (postingRead.current) return;
    postingRead.current = true;
    fillFromDescription();
  });

  async function runMatch(text: string) {
    const id = ++matchRequestId.current;
    setMatching(true);
    setMatchResult(null);
    try {
      const result = await matchResumeToJob(text);
      if (id !== matchRequestId.current) return;
      // Scraped text isn't a real JD; ask for the posting instead of a "do not apply" verdict on garbage.
      if (result.status === "insufficient_jd") {
        setMissingJd({ kind: "not_a_jd" });
        return;
      }
      setMatchResult(result);
      // Only into empty fields, read at answer time, so nothing typed while it ran is overwritten.
      if (result.status === "ok") {
        setCompany(current => current.trim() ? current : result.company);
        setRole(current => current.trim() ? current : result.role);
      }
    } catch {
      if (id === matchRequestId.current) setMatchResult({ status: "unavailable" });
    } finally {
      if (id === matchRequestId.current) setMatching(false);
    }
  }

  async function handleFetchDetails() {
    if (!url) return;
    setScraping(true);
    setMissingJd(null);
    setMatchResult(null);
    try {
      const result = await scrapeJob(url);
      if (result.company) setCompany(result.company);
      if (result.role) setRole(result.role);
      if (result.location) setLocation(result.location);
      if (result.city) setCity(result.city);
      if (result.compMin != null) setCompMin(String(result.compMin));
      if (result.compMax != null) setCompMax(String(result.compMax));
      if (result.raw) setJdText(result.raw);
      if (result.raw) {
        if (canRecommend && useAi) runMatch(result.raw);
      } else {
        setMissingJd(result.reason ? { kind: "scrape", reason: result.reason } : { kind: "not_a_jd" });
      }
    } catch {
      setMissingJd({ kind: "fetch_failed" });
    } finally {
      setScraping(false);
      setStep("form");
    }
  }

  // Fills only what's still empty when the answer lands, so nothing typed, even while it ran, is overwritten.
  // The company comes from the recommendation.
  async function fillFromDescription() {
    setFilling(true);
    setFillNote(null);
    try {
      const result = await readPastedJob(jdText);
      if (result.role) setRole(current => current.trim() ? current : result.role!);
      if (result.location) setLocation(current => current || result.location!);
      if (result.compMin != null) setCompMin(current => current || String(result.compMin));
      if (result.compMax != null) setCompMax(current => current || String(result.compMax));
      if (!result.role && !result.location && result.compMin == null) {
        setFillNote("No title, work model, or pay found in it.");
      }
    } catch (err) {
      setFillNote(err instanceof Error ? err.message : "failed to read the description");
    } finally {
      setFilling(false);
    }
  }

  function goToForm() {
    setMissingJd(null);
    setMatchResult(null);
    setStep("form");
  }

  // Back keeps what's typed, so a second Fetch only overwrites what the page actually provides.
  function backToLink() {
    matchRequestId.current++;
    setMatching(false);
    setStep("url");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    if (compMin && compMax && Number(compMin) > Number(compMax)) {
      setError("Comp min can't be greater than comp max.");
      return;
    }
    setSubmitting(true);
    // Name only, so Job Details can show which resume was recommended.
    const recommendedResume = matchResult && matchResult.status === "ok" ? matchResult.fileName : undefined;
    try {
      const job = await createJob({
        company,
        role,
        sourceCategory,
        url: url || undefined,
        location: location || undefined,
        city: city.trim() || undefined,
        compMin: compMin ? Number(compMin) : undefined,
        compMax: compMax ? Number(compMax) : undefined,
        notes: notes || undefined,
        startingStage: recruiterReachedOut ? "INTERVIEW_REQUEST" : undefined,
        jdText: jdText.trim() || undefined,
        recommendedResume,
      });
      // A link typed without a Fetch: scrape it in the background, so adding the job doesn't wait on it.
      if (!jdText.trim() && url) {
        scrapeJob(url)
          .then(result => {
            // Only the field this sets: notes typed while the scrape ran must survive it.
            if (result.raw) return updateJobDetail(job.id, { jdText: result.raw });
          })
          .catch(() => onWarning(ATTACH_FAILED));
      }
      // The nav closes its modal on this, which unmounts the form, so the next add starts empty.
      onCreated(job);
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
        {!aiConfigured ? (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            AI features are off: no AI provider is set up.
          </p>
        ) : !canRecommend ? (
          <p className={hintClass}>Upload a resume on the Resumes page to get a fit recommendation for each job.</p>
        ) : (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={useAi} onChange={e => setUseAi(e.target.checked)} />
            Use AI and get a recommendation
          </label>
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
            onClick={goToForm}
            className="text-sm text-neutral-600 hover:underline dark:text-neutral-400"
          >
            Skip — enter manually
          </button>
        </div>
        <p className={hintClass}>No postable link (e.g. a LinkedIn message or email)? Skip and fill in what you know.</p>
        {!posting && (
          <div className="space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-700">
            <p className={hintClass}>
              On LinkedIn or a site that needs you signed in, a pasted link gets nothing. Drag this to your bookmarks
              bar once, then click it on any posting to open this form filled in:
            </p>
            <SaveToJobTrackerButton />
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <button type="button" onClick={backToLink} className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← Back to the link
      </button>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="space-y-2">
        {missingJd && (
          <p role="alert" className="text-sm text-amber-700 dark:text-amber-300">
            {MISSING_JD_MESSAGE(missingJd)} Paste it below.
          </p>
        )}
        <label htmlFor="jd-text" className={labelClass}>Job description</label>
        <textarea
          id="jd-text"
          rows={4}
          className={inputClass}
          value={jdText}
          onChange={e => setJdText(e.target.value)}
          placeholder="Paste the posting's description. It's saved with the job."
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={fillFromDescription}
            disabled={!jdText.trim() || filling}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
          >
            {filling ? "Reading…" : "Fill in title, location and pay"}
          </button>
          {fillNote && <span className="text-xs text-amber-700 dark:text-amber-300">{fillNote}</span>}
        </div>
        {canRecommend ? (
          <button
            type="button"
            onClick={() => runMatch(jdText)}
            disabled={!jdText.trim() || matching}
            className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:opacity-50 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
          >
            {matching ? "Getting recommendation…" : matchResult ? "Get recommendation again" : "Get recommendation"}
          </button>
        ) : (
          <p className={hintClass}>
            {aiConfigured
              ? "Upload a resume on the Resumes page to get a recommendation from this."
              : "AI is off, so there's no recommendation, but the description is still saved."}
          </p>
        )}
        {matchResult && <MatchResultBanner result={matchResult} />}
      </div>

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
        <div>
          <label htmlFor="city" className={labelClass}>City</label>
          <input id="city" className={inputClass} value={city} maxLength={100} onChange={e => setCity(e.target.value)} />
        </div>
        <div>
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
        <fieldset className="col-span-2">
          <legend className={labelClass}>Where is it now?</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="starting-stage"
                checked={!recruiterReachedOut}
                onChange={() => setRecruiterReachedOut(false)}
              />
              Applied, waiting to hear back
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="starting-stage"
                checked={recruiterReachedOut}
                onChange={() => setRecruiterReachedOut(true)}
              />
              A recruiter reached out
            </label>
          </div>
        </fieldset>
      </div>
      {aiConfigured && company.trim() && <CompanyBriefPanel company={company} role={role} />}
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
        <p className="font-medium">
          {isApply
            ? `✓ I'd recommend this job, based on ${result.strengths.join(", ")}.`
            : `⚠ I wouldn't apply: ${result.gaps.join(", ")}.`}
        </p>
        {isApply && result.gaps.length > 0 && <p>Gaps: {result.gaps.join(", ")}.</p>}
        {!isApply && result.strengths.length > 0 && <p>In your favor: {result.strengths.join(", ")}.</p>}
        <p>
          {isApply ? "Use" : "Closest resume"}: <strong>{result.fileName}</strong>
        </p>
        {/* A verdict over some of your resumes must say so, or it reads as if all were weighed. */}
        {result.skippedResumes ? (
          <p className="mt-1 text-xs opacity-80">
            {result.skippedResumes} of your resumes couldn't be read and weren't considered.
          </p>
        ) : null}
      </div>
    );
  }

  const message =
    result.status === "no_resumes"
      ? "No analyzed resumes yet — upload one on the Resumes page."
      : result.status === "not_configured"
        ? "Set up an AI provider to get recommendations."
        : "Recommendation unavailable right now — try again.";

  return (
    <div className="rounded border border-neutral-300 bg-neutral-50 p-3 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
      {message}
    </div>
  );
}
