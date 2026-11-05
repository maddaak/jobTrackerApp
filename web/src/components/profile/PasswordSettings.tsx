import { useState, type FormEvent } from "react";
import { changePassword, signOutOtherDevices } from "../../api/accountApi";

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";

const EMPTY = { current: "", next: "", confirm: "" };

export default function PasswordSettings() {
  const [fields, setFields] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (fields.next !== fields.confirm) {
      setError("the two new passwords don't match");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changePassword(fields.current, fields.next);
      setFields(EMPTY);
      setNotice("Password changed. Any other device signed in to this account has been signed out.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to change your password");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOutOthers() {
    setNotice(null);
    setError(null);
    setSaving(true);
    try {
      await signOutOtherDevices();
      setNotice("Every other device signed in to this account has been signed out.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to sign out your other devices");
    } finally {
      setSaving(false);
    }
  }

  const input = (key: keyof typeof EMPTY, label: string, autoComplete: string) => (
    <label className="block text-sm">
      <span className="mb-1 block font-medium">{label}</span>
      <input
        type="password"
        required
        autoComplete={autoComplete}
        className={inputClass}
        value={fields[key]}
        onChange={e => setFields(current => ({ ...current, [key]: e.target.value }))}
      />
    </label>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700 dark:text-green-400">{notice}</p>}
      {input("current", "Current password", "current-password")}
      {input("next", "New password", "new-password")}
      {input("confirm", "Confirm new password", "new-password")}
      <p className="text-xs text-neutral-500 dark:text-neutral-400">At least 8 characters, with uppercase, lowercase, a digit, and a symbol.</p>
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Change password
        </button>
      </div>
      {/* For a session left open on a shared or lost device, without having to change the password. */}
      <div className="flex items-center justify-between gap-3 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800">
        <span className="text-neutral-600 dark:text-neutral-300">Signed in on a device you no longer use?</span>
        <button
          type="button"
          onClick={handleSignOutOthers}
          disabled={saving}
          className="shrink-0 rounded border border-neutral-300 px-3 py-1.5 font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          Sign out other devices
        </button>
      </div>
    </form>
  );
}
