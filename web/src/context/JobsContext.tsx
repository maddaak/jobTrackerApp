import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { listJobs, type JobSummary } from "../api/jobsApi";
import { JobsContext } from "../hooks/useJobsContext";

// One job list for the whole signed-in app, so a job added from the nav shows up in the nav's
// counts and on whichever page is open without each of them loading its own copy.
export function JobsProvider({ children }: { children: ReactNode }) {
  const [jobs, setJobsState] = useState<JobSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tag every load so a slower earlier refresh can't overwrite the newest snapshot.
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    try {
      const loaded = await listJobs();
      if (id !== requestId.current) return;
      // request casts without validating, and the nav's counts would crash on anything but a list.
      if (!Array.isArray(loaded)) throw new Error("failed to load jobs");
      setJobsState(loaded);
      setLoaded(true);
      setLoadError(null);
    } catch (err) {
      if (id === requestId.current) setLoadError(err instanceof Error ? err.message : "failed to load jobs");
    }
  }, []);

  // A local edit is newer than any load still in flight, so that load must not land over it. Before the first
  // load there's no list to edit, so load again instead: the change is saved, so the new load has it.
  const setJobs = useCallback((update: (previous: JobSummary[]) => JobSummary[]) => {
    requestId.current++;
    setJobsState(update);
    if (!loaded) refresh();
  }, [loaded, refresh]);

  useEffect(() => {
    refresh();
    // Bumping the id on unmount makes a load still in flight land nowhere.
    const ids = requestId;
    return () => { ids.current++; };
  }, [refresh]);

  return (
    <JobsContext.Provider value={{ jobs, loaded, setJobs, loadError, refresh }}>
      {children}
    </JobsContext.Provider>
  );
}
