import { useState } from "react";
import { updateJob, type JobSummary, type UpdateJobInput } from "../../api/jobsApi";
import { hasStage } from "../../jobPlacement";
import { StageSelect, StatusSelect, WaitingOnResults } from "./StatusPickers";

export interface JobStatusControlsProps {
  job: JobSummary;
  onError: (message: string) => void;
  onChanged: () => void;
}

const selectClass =
  "rounded border border-neutral-300 bg-white px-2 py-1 text-sm disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900";

export default function JobStatusControls({ job, onError, onChanged }: JobStatusControlsProps) {
  const [saving, setSaving] = useState(false);

  async function save(input: UpdateJobInput) {
    setSaving(true);
    try {
      await updateJob(job.id, input);
      onChanged();
    } catch (err) {
      onError(err instanceof Error ? err.message : "failed to update job");
    } finally {
      setSaving(false);
    }
  }

  const picker = { job, disabled: saving, onChange: save };
  return (
    <div className="flex flex-wrap items-center gap-4 rounded border border-neutral-200 p-3 text-sm dark:border-neutral-700">
      <label className="flex items-center gap-2">
        <span className="font-medium">Status</span>
        <StatusSelect {...picker} className={selectClass} />
      </label>
      {hasStage(job) && (
        <>
          <label className="flex items-center gap-2">
            <span className="font-medium">Stage</span>
            <StageSelect {...picker} className={selectClass} />
          </label>
          <WaitingOnResults {...picker} className="flex items-center gap-2" />
        </>
      )}
    </div>
  );
}
