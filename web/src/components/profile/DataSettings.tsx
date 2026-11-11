import { useState, type ChangeEvent } from "react";
import { EXPORT_URL, restoreBackup } from "../../api/accountApi";
import { useJobsContext } from "../../hooks/useJobsContext";

const buttonClass =
  "inline-block cursor-pointer rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800";

// Nothing is hosted, so this file is the only copy of a job search that isn't in this machine's Docker volumes.
// A restore can add seasons and switches to the newest one, so onSeasonsChanged reloads the sidebar's picker.
export default function DataSettings({ onSeasonsChanged }: { onSeasonsChanged: () => void }) {
  const { refresh } = useJobsContext();
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setNotice(null);
    setRestoring(true);
    try {
      const restored = await restoreBackup(file);
      setNotice(`Restored ${restored.jobs} jobs, ${restored.images} images, and ${restored.resumes} resumes.`);
      refresh();
      onSeasonsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to restore the backup");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <div className="space-y-4 text-sm">
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p role="status" className="text-green-700 dark:text-green-400">{notice}</p>}
      <div>
        <a href={EXPORT_URL} download className={buttonClass}>Download a backup</a>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Every job, round, note, offer, image, and resume, plus your reminder settings, in one file. Not your
          password. Keep it somewhere other than this machine.
        </p>
      </div>
      <div>
        <label className={`${buttonClass} ${restoring ? "pointer-events-none opacity-50" : ""}`}>
          {restoring ? "Restoring…" : "Restore from a backup"}
          <input type="file" accept=".json,application/json" className="sr-only" onChange={handleFile} />
        </label>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Only into an account with no jobs or resumes yet, such as a new install, so nothing is doubled or overwritten.
        </p>
      </div>
    </div>
  );
}
