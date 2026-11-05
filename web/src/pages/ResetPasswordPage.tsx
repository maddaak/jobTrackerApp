import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { resetPassword } from "../api/accountApi";
import AuthCard, { authButtonClass, authInputClass, authLabelClass } from "../components/AuthCard";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("the two passwords don't match");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to reset your password");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token || done) {
    return (
      <AuthCard title={done ? "Password changed" : "This link is incomplete"}>
        <p className="text-sm">
          {done ? "You can log in with your new password." : "Open the link from the email exactly as it was sent, or ask for a new one."}
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to={done ? "/login" : "/forgot-password"} className="text-blue-600 hover:underline dark:text-blue-400">
            {done ? "Log in" : "Ask for a new link"}
          </Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="new-password" className={authLabelClass}>New password</label>
          <input id="new-password" type="password" required autoComplete="new-password" className={authInputClass} value={password} onChange={e => setPassword(e.target.value)} />
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">At least 8 characters, with uppercase, lowercase, a digit, and a symbol.</p>
        </div>
        <div>
          <label htmlFor="confirm-password" className={authLabelClass}>Confirm new password</label>
          <input id="confirm-password" type="password" required autoComplete="new-password" className={authInputClass} value={confirm} onChange={e => setConfirm(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button type="submit" disabled={submitting} className={authButtonClass}>Set new password</button>
      </form>
    </AuthCard>
  );
}
