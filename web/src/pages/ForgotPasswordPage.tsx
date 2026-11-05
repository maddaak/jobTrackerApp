import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { forgotPassword, TERMINAL_RESET_COMMAND } from "../api/accountApi";
import AuthCard, { authButtonClass, authInputClass, authLabelClass } from "../components/AuthCard";

// There's no hosted account service, so the terminal command is always offered: it works with no email set up.
function TerminalFallback() {
  return (
    <div className="rounded border border-neutral-200 bg-neutral-50 p-3 text-xs dark:border-neutral-700 dark:bg-neutral-800">
      <p className="mb-1">No email? On the machine running the app, run:</p>
      <code className="block break-all">{TERMINAL_RESET_COMMAND}</code>
      <p className="mt-1">It prints a temporary password. Log in with it, then change it under Profile.</p>
    </div>
  );
}

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await forgotPassword(username.trim());
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to send the reset email");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthCard title="Reset your password">
      {sent ? (
        <p role="status" className="mb-4 text-sm">
          If email is set up on this app and that account has an address, a reset link is on its way. It works for an hour.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="mb-4 space-y-4">
          <div>
            <label htmlFor="username" className={authLabelClass}>Username</label>
            <input id="username" required autoComplete="username" className={authInputClass} value={username} onChange={e => setUsername(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={submitting} className={authButtonClass}>Email me a reset link</button>
        </form>
      )}
      <TerminalFallback />
      <p className="mt-4 text-center text-sm">
        <Link to="/login" className="text-blue-600 hover:underline dark:text-blue-400">Back to log in</Link>
      </p>
    </AuthCard>
  );
}
