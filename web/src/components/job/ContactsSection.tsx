import { useState, type FormEvent } from "react";
import { CONTACT_ROLE_LABELS, CONTACT_ROLES, updateJobDetail, type Contact, type ContactRole } from "../../api/jobsApi";
import { safeHref } from "../../safeHref";
import { today } from "../../localDate";

export interface ContactsSectionProps {
  jobId: number;
  contacts: Contact[];
  onContactsChange: (contacts: Contact[]) => void;
  onError: (message: string) => void;
}

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const actionClass = "text-xs text-blue-600 hover:underline disabled:opacity-50 dark:text-blue-400";
const DAY_MS = 24 * 60 * 60 * 1000;

const EMPTY: Contact = {
  name: "", role: "RECRUITER", email: null, linkedInUrl: null, lastContactedOn: null, notes: null, followUpOn: null,
};

function followUpLabel(date: string): { text: string; due: boolean } {
  if (date <= today()) return { text: "follow-up due", due: true };
  const day = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return { text: `follow up by ${day}`, due: false };
}

function lastSpoke(date: string): string {
  const days = Math.round((new Date(`${today()}T00:00:00`).getTime() - new Date(`${date}T00:00:00`).getTime()) / DAY_MS);
  if (days <= 0) return "spoke today";
  return days === 1 ? "spoke yesterday" : `spoke ${days} days ago`;
}

// The people for this job: who to follow up with and when you last did. Saved on each change.
export default function ContactsSection({ jobId, contacts, onContactsChange, onError }: ContactsSectionProps) {
  // The index being edited, contacts.length for a new one, null when the form is closed.
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState<Contact>(EMPTY);
  const [saving, setSaving] = useState(false);

  async function save(next: Contact[]) {
    setSaving(true);
    try {
      const saved = await updateJobDetail(jobId, { contacts: next });
      onContactsChange(saved.contacts ?? next);
      setEditing(null);
      return true;
    } catch (err) {
      onError(err instanceof Error ? err.message : "failed to save contacts");
      return false;
    } finally {
      setSaving(false);
    }
  }

  function open(index: number) {
    setDraft(contacts[index] ?? EMPTY);
    setEditing(index);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (editing === null) return;
    const next = [...contacts];
    next[editing] = draft;
    save(next);
  }

  const set = <K extends keyof Contact>(field: K, value: Contact[K]) => setDraft(current => ({ ...current, [field]: value }));

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <p className="text-sm font-medium">People</p>
        {editing === null && (
          <button type="button" onClick={() => open(contacts.length)} className={actionClass}>+ Add person</button>
        )}
      </div>
      {contacts.length === 0 && editing === null && (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No one yet. Add the recruiter, a referrer, or the hiring manager to keep track of who to follow up with.
        </p>
      )}
      <ul className="space-y-1 text-sm">
        {contacts.map((contact, i) => {
          const linkedIn = safeHref(contact.linkedInUrl);
          const followUp = contact.followUpOn ? followUpLabel(contact.followUpOn) : null;
          return (
            <li key={i} className="flex items-start justify-between gap-2 rounded border border-neutral-200 px-2 py-1 dark:border-neutral-700">
              <span>
                <span className="font-medium">
                  {linkedIn ? <a href={linkedIn} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">{contact.name} ↗</a> : contact.name}
                </span>
                <span className="text-neutral-500 dark:text-neutral-400"> · {CONTACT_ROLE_LABELS[contact.role]}</span>
                {contact.email && (
                  <> · <a href={`mailto:${contact.email}`} className="text-blue-600 hover:underline dark:text-blue-400">{contact.email}</a></>
                )}
                {contact.lastContactedOn && <span className="text-neutral-500 dark:text-neutral-400"> · {lastSpoke(contact.lastContactedOn)}</span>}
                {followUp && (
                  <span className={followUp.due ? "font-medium text-amber-700 dark:text-amber-300" : "text-neutral-500 dark:text-neutral-400"}>
                    {" · "}{followUp.text}
                  </span>
                )}
                {contact.notes && <span className="block text-xs text-neutral-500 dark:text-neutral-400">{contact.notes}</span>}
              </span>
              <span className="flex shrink-0 gap-3">
                <button
                  type="button"
                  disabled={saving}
                  aria-label={`Spoke to ${contact.name} today`}
                  onClick={() => save(contacts.map((c, j) => (j === i ? { ...c, lastContactedOn: today() } : c)))}
                  className={actionClass}
                >
                  Spoke today
                </button>
                <button type="button" aria-label={`Edit ${contact.name}`} onClick={() => open(i)} className={actionClass}>Edit</button>
                <button
                  type="button"
                  disabled={saving}
                  aria-label={`Remove ${contact.name}`}
                  onClick={() => save(contacts.filter((_, j) => j !== i))}
                  className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                >
                  Remove
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {editing !== null && (
        <form onSubmit={handleSubmit} className="mt-2 grid grid-cols-2 gap-2 rounded border border-neutral-200 p-2 text-sm dark:border-neutral-700">
          <input aria-label="Name" required maxLength={100} placeholder="Name" className={inputClass}
            value={draft.name} onChange={e => set("name", e.target.value)} />
          <select aria-label="Their role" className={inputClass} value={draft.role} onChange={e => set("role", e.target.value as ContactRole)}>
            {CONTACT_ROLES.map(role => <option key={role} value={role}>{CONTACT_ROLE_LABELS[role]}</option>)}
          </select>
          <input aria-label="Email" type="email" maxLength={200} placeholder="Email" className={inputClass}
            value={draft.email ?? ""} onChange={e => set("email", e.target.value || null)} />
          <input aria-label="LinkedIn" type="url" maxLength={500} placeholder="LinkedIn profile link" className={inputClass}
            value={draft.linkedInUrl ?? ""} onChange={e => set("linkedInUrl", e.target.value || null)} />
          <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
            Last spoke
            <input aria-label="Last spoke" type="date" className={inputClass}
              value={draft.lastContactedOn ?? ""} onChange={e => set("lastContactedOn", e.target.value || null)} />
          </label>
          <label className="flex items-center gap-2 text-xs text-neutral-600 dark:text-neutral-300">
            Follow up by
            <input aria-label="Follow up by" type="date" className={inputClass}
              value={draft.followUpOn ?? ""} onChange={e => set("followUpOn", e.target.value || null)} />
          </label>
          <input aria-label="Notes about them" maxLength={2000} placeholder="Notes" className={`${inputClass} col-span-2`}
            value={draft.notes ?? ""} onChange={e => set("notes", e.target.value || null)} />
          <div className="col-span-2 flex gap-2">
            <button type="submit" disabled={saving} className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
              {saving ? "Saving…" : "Save person"}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="rounded border border-neutral-300 px-3 py-1 text-sm dark:border-neutral-600">
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
