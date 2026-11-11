import { useState } from "react";
import { listResumes } from "../../api/resumesApi";
import { updateJobDetail } from "../../api/jobsApi";

export interface SentResumePickerProps {
  jobId: number;
  sentResume: string | null;
  onChange: (sentResume: string | null) => void;
  onError: (message: string) => void;
}

const linkClass = "text-sm text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400";

// Which resume went out with this application, so Insights can show which one gets replies. The list
// loads on request, since most openings of a job never touch it.
export default function SentResumePicker({ jobId, sentResume, onChange, onError }: SentResumePickerProps) {
  const [fileNames, setFileNames] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const resumes = await listResumes();
      setFileNames(Array.isArray(resumes) ? resumes.map(resume => resume.fileName) : []);
    } catch (err) {
      onError(err instanceof Error ? err.message : "failed to load resumes");
    } finally {
      setBusy(false);
    }
  }

  async function choose(fileName: string) {
    setBusy(true);
    try {
      const saved = await updateJobDetail(jobId, { sentResume: fileName });
      onChange(saved.sentResume ?? null);
      setFileNames(null);
    } catch (err) {
      onError(err instanceof Error ? err.message : "failed to save the resume");
    } finally {
      setBusy(false);
    }
  }

  if (fileNames === null) {
    return (
      <p className="text-sm">
        <span className="font-medium">Resume sent:</span>{" "}
        {sentResume ?? <span className="text-neutral-500 dark:text-neutral-400">not recorded</span>}{" "}
        <button type="button" onClick={open} disabled={busy} className={linkClass}>
          {sentResume ? "Change" : "Record it"}
        </button>
      </p>
    );
  }
  // A resume deleted since stays choosable, so recording a new one never silently drops the old name.
  const options = sentResume && !fileNames.includes(sentResume) ? [sentResume, ...fileNames] : fileNames;
  if (options.length === 0) {
    return <p className="text-sm text-neutral-500 dark:text-neutral-400">Upload your resumes on the Resumes page to record which one you sent.</p>;
  }
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="font-medium">Resume sent</span>
      <select
        value={sentResume ?? ""}
        disabled={busy}
        onChange={e => choose(e.target.value)}
        className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900"
      >
        <option value="">Not recorded</option>
        {options.map(fileName => <option key={fileName} value={fileName}>{fileName}</option>)}
      </select>
    </label>
  );
}
