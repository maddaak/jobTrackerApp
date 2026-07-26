import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { listJobs, type JobSummary } from "../api/jobsApi";
import AddJobForm from "../components/AddJobForm";
import JobsTable from "../components/JobsTable";
import Modal from "../components/Modal";

export default function HomePage() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    refreshJobs();
  }, []);

  async function refreshJobs() {
    try {
      setJobs(await listJobs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load jobs");
    }
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

        {error && <p role="alert" className="mb-4 text-sm text-red-600">{error}</p>}

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
        <JobsTable jobs={jobs} onSaved={refreshJobs} onDeleted={refreshJobs} />
      </div>
    </div>
  );
}
