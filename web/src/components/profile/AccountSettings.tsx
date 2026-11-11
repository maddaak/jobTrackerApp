import { useState, type FormEvent } from "react";
import { updateAccount, type Account } from "../../api/accountApi";

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";

export default function AccountSettings({ initial }: { initial: Account }) {
  const [name, setName] = useState(initial.name ?? "");
  const [email, setEmail] = useState(initial.email ?? "");
  const [savedEmail, setSavedEmail] = useState(initial.email ?? "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Matches core's rule: password reset links go to this address, so moving it takes the password.
  const emailChanging = email.trim().toLowerCase() !== savedEmail.toLowerCase();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const saved = await updateAccount(name.trim(), email.trim(), emailChanging ? currentPassword : undefined);
      setName(saved.name ?? "");
      setEmail(saved.email ?? "");
      setSavedEmail(saved.email ?? "");
      setCurrentPassword("");
      setNotice("Saved. Reminders keep going to the address under Notifications.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save your account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {!initial.name && !initial.email && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          This account was made before names and emails were asked for. Add them here.
        </p>
      )}
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {notice && <p role="status" className="text-sm text-green-700 dark:text-green-400">{notice}</p>}
      <p className="text-sm">
        <span className="text-neutral-500 dark:text-neutral-400">Username: </span>
        {initial.username}
      </p>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Name</span>
        <input required className={inputClass} value={name} onChange={e => setName(e.target.value)} />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Email</span>
        <input type="email" required className={inputClass} value={email} onChange={e => setEmail(e.target.value)} />
      </label>
      {emailChanging && (
        <div className="text-sm">
          <label className="block">
            <span className="mb-1 block font-medium">Current password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              aria-describedby="email-change-password-hint"
              className={inputClass}
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
            />
          </label>
          <p id="email-change-password-hint" className="mt-1 text-neutral-500 dark:text-neutral-400">
            Password reset links go to this email, so changing it needs your password.
          </p>
        </div>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </form>
  );
}
