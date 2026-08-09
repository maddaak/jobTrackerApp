import { useEffect, useRef, useState } from "react";
import { listJobs, type JobSummary } from "../api/jobsApi";
import AddJobForm from "../components/AddJobForm";
import JobsTable from "../components/JobsTable";
import Modal from "../components/Modal";
import UpcomingInterviewsBanner from "../components/UpcomingInterviewsBanner";

export default function HomePage() {
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [interviewsVersion, setInterviewsVersion] = useState(0);
  // Tag every load so a slower earlier autosave refresh can't overwrite the newest snapshot.
  const jobsReqId = useRef(0);

  useEffect(() => {
    // Ignore a load that resolves after unmount.
    let ignore = false;
    listJobs()
      .then(loaded => { if (!ignore) setJobs(loaded); })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load jobs"); });
    return () => { ignore = true; };
  }, []);

  async function refreshJobs() {
    const reqId = ++jobsReqId.current;
    try {
      const loaded = await listJobs();
      if (reqId === jobsReqId.current) setJobs(loaded);
    } catch (err) {
      if (reqId === jobsReqId.current) setError(err instanceof Error ? err.message : "failed to load jobs");
    }
  }

  // Any interview change affects both the table and the banner, so refresh both.
  async function refreshAll() {
    await refreshJobs();
    setInterviewsVersion(v => v + 1);
  }

  async function handleJobCreated() {
    setModalOpen(false);
    await refreshJobs();
  }

  return (
    <div className="flex h-full min-w-0 flex-col p-6">
      <div className="shrink-0">
        {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <UpcomingInterviewsBanner refreshSignal={interviewsVersion} onInterviewChanged={refreshAll} />

        <div className="mb-4 flex justify-end gap-2">
          <button
            onClick={() => setModalOpen(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add job
          </button>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add job">
        <AddJobForm onCreated={handleJobCreated} onWarning={setError} />
      </Modal>

      <div className="min-h-0 flex-1">
        <JobsTable jobs={jobs} onSaved={refreshAll} onDeleted={refreshAll} />
      </div>
    </div>
  );
}
