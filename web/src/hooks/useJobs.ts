import { useState } from "react";
import { useJobsContext } from "./useJobsContext";

// The shared job list, plus an error of the page's own: a failed save on one page shouldn't follow you to the next.
export function useJobs() {
  const { jobs, loaded, setJobs, loadError, refresh } = useJobsContext();
  const [error, setError] = useState<string | null>(null);
  return { jobs, loaded, setJobs, error: error ?? loadError, setError, refresh };
}
