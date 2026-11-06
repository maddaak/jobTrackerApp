import { useState } from "react";
import {
  saveReminderSettings,
  sendTestReminder,
  type ReminderSettings,
  type ReminderSettingsInput,
} from "../../api/remindersApi";

type Toggle = "digest" | "interviewSoon" | "offerDeadline" | "followUp";

const TOGGLES: { key: Toggle; label: string; hint: string }[] = [
  { key: "digest", label: "Daily digest", hint: "Today's and tomorrow's interviews, deadlines this week, and rounds to schedule. Skipped on a quiet day." },
  { key: "interviewSoon", label: "Interview soon", hint: "An hour before each round, with the meeting link." },
  { key: "offerDeadline", label: "Offer deadline", hint: "Two days before an offer's decision deadline." },
  { key: "followUp", label: "Follow up", hint: "When a job has heard nothing for 7 days after your last interview, and again at 14. Applications with no interview are never chased." },
];

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";

function hourLabel(hour: number) {
  return new Date(2000, 0, 1, hour).toLocaleTimeString([], { hour: "numeric" });
}

export default function NotificationSettings({ initial }: { initial: ReminderSettings }) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState<ReminderSettingsInput>({
    ...initial,
    timeZone: initial.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const next = await saveReminderSettings({ ...form, email: form.email?.trim() || null });
      setSaved(next);
      setForm({ ...next, timeZone: next.timeZone ?? form.timeZone });
      setNotice(next.emailEnabled ? "Saved." : "Saved. You won't get any email.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save notification settings");
    } finally {
      setBusy(false);
    }
  }

  async function handleTest() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await sendTestReminder();
      setNotice(`Test email sent to ${saved.email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send the test email");
    } finally {
      setBusy(false);
    }
  }

  const off = !form.emailEnabled;
  // The test goes to the saved address, so an edit in progress would test the wrong one.
  const unsaved = (form.email?.trim() || null) !== saved.email;
  // Chrome's list leaves out some zones it reports as the browser's own, such as "UTC".
  const zones = Intl.supportedValuesOf("timeZone");
  if (form.timeZone && !zones.includes(form.timeZone)) zones.unshift(form.timeZone);

  return (
    <form onSubmit={handleSave} className="space-y-5">
      {!saved.emailConfigured && (
        <p className="rounded border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          Email isn't set up on this server yet, so nothing will be sent. Add the SMTP settings to <code>.env</code> and
          run <code>docker compose up -d core</code>, since a plain restart keeps the old settings; the README's "Email
          reminders" section shows how. You can still save your choices now.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700 dark:text-green-400">{notice}</p>}

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.emailEnabled}
          onChange={e => setForm({ ...form, emailEnabled: e.target.checked })}
        />
        <span>
          <span className="block font-medium">Email me notifications</span>
          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
            Off means no email at all. Your choices below are kept for when you turn it back on.
          </span>
        </span>
      </label>

      <div className="text-sm">
        <label htmlFor="notification-email" className="mb-1 block font-medium">Email address</label>
        <input
          id="notification-email"
          type="email"
          required={form.emailEnabled}
          disabled={off}
          className={inputClass}
          placeholder="you@example.com"
          value={form.email ?? ""}
          onChange={e => setForm({ ...form, email: e.target.value })}
        />
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Used only for these notifications.</p>
      </div>

      <fieldset disabled={off} className="space-y-3 disabled:opacity-50">
        <legend className="mb-2 text-sm font-medium">Send me</legend>
        {TOGGLES.map(toggle => (
          <label key={toggle.key} className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={form[toggle.key]}
              onChange={e => setForm({ ...form, [toggle.key]: e.target.checked })}
            />
            <span>
              <span className="block font-medium">{toggle.label}</span>
              <span className="block text-xs text-neutral-500 dark:text-neutral-400">{toggle.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Digest at</span>
          <select
            className={inputClass}
            value={form.digestHour}
            disabled={off || !form.digest}
            onChange={e => setForm({ ...form, digestHour: Number(e.target.value) })}
          >
            {HOURS.map(hour => <option key={hour} value={hour}>{hourLabel(hour)}</option>)}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Time zone</span>
          <select
            className={inputClass}
            value={form.timeZone ?? ""}
            disabled={off}
            onChange={e => setForm({ ...form, timeZone: e.target.value })}
          >
            {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
          </select>
        </label>
      </div>

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleTest}
          disabled={busy || !saved.emailConfigured || !saved.email || unsaved}
          title={unsaved ? "Save first: the test goes to the saved address" : undefined}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          Send a test email
        </button>
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </form>
  );
}
