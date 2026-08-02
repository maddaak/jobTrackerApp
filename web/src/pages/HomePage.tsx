import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { listJobs, type JobSummary } from "../api/jobsApi";
import AddJobForm from "../components/AddJobForm";
import JobsTable from "../components/JobsTable";
import Modal from "../components/Modal";
import UpcomingInterviewsBanner from "../components/UpcomingInterviewsBanner";

export default function HomePage() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [interviewsVersion, setInterviewsVersion] = useState(0);
  // Concurrent row autosaves each trigger refreshJobs; tag every load so a slower earlier one
  // can't resolve last and overwrite the newest jobs snapshot with stale rows.
  const jobsReqId = useRef(0);

  useEffect(() => {
    // Ignore a mount-time load that resolves after this page has unmounted.
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

  // Any interview create/update/delete can change both the jobs table's latestInterview
  // column and the upcoming-interviews banner, so a save anywhere on the page refreshes both.
  async function refreshAll() {
    await refreshJobs();
    setInterviewsVersion(v => v + 1);
  }

  async function handleJobCreated() {
    setModalOpen(false);
    await refreshJobs();
  }

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="flex h-screen min-w-0 flex-col p-6">
      <div className="shrink-0">
        <div className="relative mb-6 flex items-center justify-center">
          <h1 className="text-2xl font-semibold">Job Tracker</h1>
          <div className="absolute right-0 flex items-center gap-3 text-sm">
            <span>Logged in as {username}</span>
            <button onClick={handleLogout} className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
              Log out
            </button>
          </div>
        </div>

        {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <UpcomingInterviewsBanner refreshSignal={interviewsVersion} onInterviewChanged={refreshAll} />

        <div className="mb-4 flex justify-end gap-2">
          <Link
            to="/metrics"
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Metrics
          </Link>
          <Link
            to="/calendar"
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Interview Schedule
          </Link>
          <Link
            to="/resumes"
            className="rounded border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Resumes
          </Link>
          <button
            onClick={() => setModalOpen(true)}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Add job
          </button>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add job">
        <AddJobForm onCreated={handleJobCreated} />
      </Modal>

      <div className="min-h-0 flex-1">
        <JobsTable jobs={jobs} onSaved={refreshAll} onDeleted={refreshAll} />
      </div>
    </div>
  );
}
