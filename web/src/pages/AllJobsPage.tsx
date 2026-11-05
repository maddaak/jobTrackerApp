import { useState } from "react";
import JobsTable from "../components/jobsTable/JobsTable";
import ImportJobsDialog from "../components/ImportJobsDialog";
import UpcomingInterviewsBanner from "../components/UpcomingInterviewsBanner";
import { useJobs } from "../hooks/useJobs";
import { downloadCsv } from "../csvExport";

const buttonClass =
  "rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800";

// The spreadsheet view of every job, kept alongside the board for scanning and bulk edits.
export default function AllJobsPage() {
  const { jobs, error, refresh } = useJobs();
  const [interviewsVersion, setInterviewsVersion] = useState(0);
  const [importing, setImporting] = useState(false);

  // Any interview change affects both the table and the banner, so refresh both.
  async function refreshAll() {
    await refresh();
    setInterviewsVersion(v => v + 1);
  }

  return (
    <div className="flex h-full min-w-0 flex-col p-6">
      <div className="shrink-0">
        {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}
        <UpcomingInterviewsBanner refreshSignal={interviewsVersion} onInterviewChanged={refreshAll} />
      </div>

      <div className="min-h-0 flex-1">
        <JobsTable
          jobs={jobs}
          onSaved={refreshAll}
          onDeleted={refreshAll}
          // The download takes the rows shown, so a filtered table saves just what's filtered.
          toolbar={shown => (
            <div className="mb-3 flex shrink-0 justify-end gap-2">
              <button type="button" onClick={() => setImporting(true)} className={buttonClass}>
                Import from a spreadsheet
              </button>
              <button
                type="button"
                disabled={shown.length === 0}
                onClick={() => downloadCsv(`jobs-${new Date().toISOString().slice(0, 10)}.csv`, shown)}
                className={buttonClass}
              >
                Download as a spreadsheet
              </button>
            </div>
          )}
        />
      </div>

      <ImportJobsDialog open={importing} onClose={() => setImporting(false)} onImported={refreshAll} />
    </div>
  );
}
