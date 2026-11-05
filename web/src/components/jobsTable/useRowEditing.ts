import { createContext, useContext, useState } from "react";
import { deleteJob, toUpdateJobInput, updateJob, type JobSummary } from "../../api/jobsApi";

// The cells edited behind a pencil; everything else saves the moment it changes.
export type EditableField = "company" | "position" | "city" | "salary";

// Edits not yet confirmed by a refresh, laid over each row: typed into a pencil cell, or saved and
// awaiting the list that will show them.
export function useRowEditing(jobs: JobSummary[], onSaved: () => void | Promise<void>, onDeleted: () => void) {
  const [pendingEdits, setPendingEdits] = useState<Record<number, Partial<JobSummary>>>({});
  // Per-row so row A finishing doesn't clear row B's still-saving state.
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ jobId: number; field: EditableField } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function rowOf(job: JobSummary): JobSummary {
    const edits = pendingEdits[job.id];
    if (!edits) return job;
    // boardPhase is display only; a picked phase moves it the way the save will.
    return { ...job, ...edits, boardPhase: edits.interviewPhase ?? job.boardPhase };
  }

  function setField<K extends keyof JobSummary>(jobId: number, field: K, value: JobSummary[K]) {
    setPendingEdits(prev => ({ ...prev, [jobId]: { ...prev[jobId], [field]: value } }));
  }

  function setSaving(jobId: number, saving: boolean) {
    setSavingIds(prev => {
      const next = new Set(prev);
      if (saving) next.add(jobId);
      else next.delete(jobId);
      return next;
    });
  }

  // Saves the whole row: what's pending, plus changes, which show at once rather than after the refresh.
  async function save(jobId: number, changes: Partial<JobSummary> = {}) {
    const original = jobs.find(job => job.id === jobId);
    if (!original) return;
    const merged = { ...original, ...pendingEdits[jobId], ...changes };
    setPendingEdits(prev => ({ ...prev, [jobId]: { ...prev[jobId], ...changes } }));
    setSaving(jobId, true);
    setError(null);
    try {
      await updateJob(jobId, toUpdateJobInput(merged));
      // Held until the refreshed list is in, or the row flips back to the old value in between.
      await onSaved();
    } catch (err) {
      setError(`${original.company}: ${err instanceof Error ? err.message : "failed to save changes"}; the change was not kept`);
    } finally {
      // Win or lose, the attempted values go: on success the refreshed row shows them; on failure the row
      // must show what's really saved. A field changed again while this was in flight survives.
      setPendingEdits(prev => {
        const remaining = Object.entries(prev[jobId] ?? {})
          .filter(([key, value]) => value !== merged[key as keyof JobSummary]);
        const next = { ...prev };
        if (remaining.length === 0) delete next[jobId];
        else next[jobId] = Object.fromEntries(remaining) as Partial<JobSummary>;
        return next;
      });
      setSaving(jobId, false);
    }
  }

  // Opening another edit must not strand the open one unsaved while it still shows the new value.
  function startEditing(jobId: number, field: EditableField) {
    if (editingCell && pendingEdits[editingCell.jobId] && (editingCell.jobId !== jobId || editingCell.field !== field)) {
      save(editingCell.jobId);
    }
    setEditingCell({ jobId, field });
  }

  function finishEditing(jobId: number) {
    setEditingCell(null);
    if (pendingEdits[jobId]) save(jobId);
  }

  async function remove(job: JobSummary) {
    if (!window.confirm("Delete this job permanently?")) return;
    setSaving(job.id, true);
    setError(null);
    try {
      await deleteJob(job.id);
      setPendingEdits(prev => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
      setEditingCell(prev => (prev?.jobId === job.id ? null : prev));
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete job");
    } finally {
      setSaving(job.id, false);
    }
  }

  return {
    rowOf,
    setField,
    save,
    remove,
    startEditing,
    finishEditing,
    isEditing: (jobId: number, field: EditableField) => editingCell?.jobId === jobId && editingCell.field === field,
    isSaving: (jobId: number) => savingIds.has(jobId),
    error,
    setError,
  };
}

// What a cell can do beyond editing its own row: the table owns the dialogs and the scroll.
export interface JobsTableActions {
  editing: ReturnType<typeof useRowEditing>;
  openDetails: (jobId: number) => void;
  addInterview: (jobId: number) => void;
  openLatestRound: (job: JobSummary) => void;
  jumpToJob: (jobId: number) => void;
}

// Cells read the table's state from here, so the column definitions can stay fixed at module level and
// a keystroke re-renders a cell without remounting the input inside it.
export const JobsTableContext = createContext<JobsTableActions | null>(null);

export function useJobsTable(): JobsTableActions {
  const actions = useContext(JobsTableContext);
  if (!actions) throw new Error("table cells must render inside JobsTable");
  return actions;
}
