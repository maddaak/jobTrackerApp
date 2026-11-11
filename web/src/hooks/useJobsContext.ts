import { createContext, useContext } from "react";
import type { JobSummary } from "../api/jobsApi";

// Apart from JobsProvider so its file exports only a component, which fast refresh needs.
export interface JobsContextValue {
  jobs: JobSummary[];
  // False until the first load lands, so an empty list is never shown as "you have nothing".
  loaded: boolean;
  setJobs: (update: (previous: JobSummary[]) => JobSummary[]) => void;
  loadError: string | null;
  refresh: () => Promise<void>;
}

export const JobsContext = createContext<JobsContextValue | null>(null);

export function useJobsContext(): JobsContextValue {
  const value = useContext(JobsContext);
  if (!value) throw new Error("useJobsContext must be used inside a JobsProvider");
  return value;
}
