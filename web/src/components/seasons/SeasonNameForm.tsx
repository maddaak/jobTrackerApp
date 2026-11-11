import { useState, type FormEvent } from "react";

export interface SeasonNameFormProps {
  label: string;
  initial: string;
  submitLabel: string;
  onSave: (name: string) => Promise<void>;
  onCancel: () => void;
}

// The one name field, for renaming a season and for starting one. Escape backs out.
export default function SeasonNameForm({ label, initial, submitLabel, onSave, onCancel }: SeasonNameFormProps) {
  const [name, setName] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave(name.trim());
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        aria-label={label}
        autoFocus
        required
        maxLength={100}
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") onCancel(); }}
        className="min-w-0 flex-1 rounded border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button type="submit" disabled={saving || !name.trim()}
        className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {saving ? "Saving…" : submitLabel}
      </button>
      <button type="button" onClick={onCancel} className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-600">
        Cancel
      </button>
    </form>
  );
}
