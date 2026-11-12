import { useState, type FormEvent } from "react";
import Modal from "../Modal";
import { today } from "../../localDate";

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium";

export interface AcceptOfferDialogProps {
  // What's shown in the title, such as "Globex, Staff Engineer".
  label: string;
  // What the offer already holds, so a second visit starts from it.
  acceptedOn: string | null;
  startDate: string | null;
  // Rejects with a message to show; the dialog stays open to try again.
  onAccept: (days: { acceptedOn: string | null; startDate: string | null }) => Promise<void>;
  onCancel: () => void;
}

// Accepting asks the two days the season summary is built on: when you said yes and when you start.
export default function AcceptOfferDialog({ label, acceptedOn, startDate, onAccept, onCancel }: AcceptOfferDialogProps) {
  const [accepted, setAccepted] = useState(acceptedOn ?? today());
  const [starts, setStarts] = useState(startDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onAccept({ acceptedOn: accepted || null, startDate: starts || null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to accept the offer");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onCancel} title={`Accept ${label}`}>
      <form onSubmit={submit} className="space-y-4">
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="accepted-on" className={labelClass}>Day you accepted</label>
            <input id="accepted-on" type="date" className={inputClass} value={accepted}
              onChange={e => setAccepted(e.target.value)} />
          </div>
          <div>
            <label htmlFor="start-date" className={labelClass}>Start date</label>
            <input id="start-date" type="date" className={inputClass} value={starts}
              onChange={e => setStarts(e.target.value)} />
          </div>
        </div>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          Either can be filled in later, from here or when you close the season.
        </p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Saving…" : "Accept offer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
