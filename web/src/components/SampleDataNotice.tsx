import { useEffect, useState } from "react";
import { loadSampleData, removeSampleData, sampleStatus } from "../api/accountApi";
import { useJobsContext } from "../hooks/useJobsContext";

const buttonClass =
  "rounded border border-neutral-300 px-3 py-1 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800";

// Offers the sample to an empty account, and says plainly when what's on screen is made up. onChanged
// reloads the page's own data, such as its upcoming rounds, which the sample adds and removes too.
export default function SampleDataNotice({ onChanged }: { onChanged: () => Promise<void> | void }) {
  const { jobs, loaded } = useJobsContext();
  const [sample, setSample] = useState<{ jobs: number; canLoad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Asked again whenever the list changes, so it notices jobs added or a sample removed elsewhere.
  useEffect(() => {
    if (!loaded) return;
    let ignore = false;
    sampleStatus()
      .then(status => { if (!ignore) setSample(status); })
      .catch(() => { if (!ignore) setSample({ jobs: 0, canLoad: false }); });
    return () => { ignore = true; };
  }, [loaded, jobs.length]);

  async function run(action: () => Promise<number>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to change the sample data");
    } finally {
      setBusy(false);
    }
  }

  if (!loaded || sample === null) return null;
  if (sample.jobs > 0) {
    return (
      <div role="status" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-violet-300 bg-violet-50 px-4 py-3 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-200">
        <p className="flex-1">
          You're looking at sample data: {sample.jobs} made-up jobs to try things with. Removing it leaves anything you've
          added yourself.
        </p>
        <button type="button" disabled={busy} onClick={() => run(removeSampleData)} className={buttonClass}>
          {busy ? "Removing…" : "Remove sample data"}
        </button>
        {error && <p role="alert" className="w-full text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }
  if (jobs.length > 0) return null;
  // The sample only goes into an account with no jobs at all, not a new season beside real ones.
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-neutral-200 px-4 py-3 text-sm dark:border-neutral-800">
      <p className="flex-1">
        Nothing here yet. Add a job with <strong>+ Add job</strong>
        {sample.canLoad ? (
          <>, bring in a spreadsheet from <strong>All jobs</strong>, or look around with a made-up search first.</>
        ) : (
          <> or bring in a spreadsheet from <strong>All jobs</strong>.</>
        )}
      </p>
      {sample.canLoad && (
        <button type="button" disabled={busy} onClick={() => run(loadSampleData)} className={buttonClass}>
          {busy ? "Loading…" : "Try it with sample data"}
        </button>
      )}
      {error && <p role="alert" className="w-full text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
