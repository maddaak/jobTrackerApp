import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, type NewAccount } from "../hooks/useAuth";
import { registrationOpen } from "../api/accountApi";
import AuthCard, { authButtonClass, authInputClass, authLabelClass } from "../components/AuthCard";

const FIELDS: { key: keyof NewAccount; label: string; type: string; autoComplete: string; hint?: string }[] = [
  { key: "name", label: "Name", type: "text", autoComplete: "name" },
  { key: "email", label: "Email", type: "email", autoComplete: "email", hint: "For reminders and password resets, if you turn them on. Nothing leaves this app otherwise." },
  { key: "username", label: "Username", type: "text", autoComplete: "username" },
  { key: "password", label: "Password", type: "password", autoComplete: "new-password", hint: "At least 8 characters, with uppercase, lowercase, a digit, and a symbol." },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [account, setAccount] = useState<NewAccount>({ name: "", email: "", username: "", password: "" });
  const [open, setOpen] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    // If the check itself fails, show the form and let the register call give the real answer.
    registrationOpen()
      .then(isOpen => { if (!ignore) setOpen(isOpen); })
      .catch(() => { if (!ignore) setOpen(true); });
    return () => { ignore = true; };
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await register({ ...account, name: account.name.trim(), email: account.email.trim() });
      navigate("/welcome");
    } catch (err) {
      setError(err instanceof Error ? err.message : "registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (open === false) {
    return (
      <AuthCard title="Registration is closed">
        <p className="text-sm">
          This app already has its account. To add another, set <code>REGISTRATION_OPEN=true</code> in{" "}
          <code>.env</code> and run <code>docker compose up -d core</code>, which reads it again.
        </p>
        <p className="mt-4 text-center text-sm">
          <Link to="/login" className="text-blue-600 hover:underline dark:text-blue-400">Log in</Link>
        </p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Create your account">
      <form onSubmit={handleSubmit} className="space-y-4">
        {FIELDS.map(field => (
          <div key={field.key}>
            <label htmlFor={field.key} className={authLabelClass}>{field.label}</label>
            <input
              id={field.key}
              type={field.type}
              required
              autoComplete={field.autoComplete}
              className={authInputClass}
              value={account[field.key]}
              onChange={e => setAccount(current => ({ ...current, [field.key]: e.target.value }))}
            />
            {field.hint && <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{field.hint}</p>}
          </div>
        ))}
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button type="submit" disabled={submitting || open === null} className={authButtonClass}>
          Register
        </button>
      </form>
      <p className="mt-4 text-center text-sm">
        Already have an account? <Link to="/login" className="text-blue-600 hover:underline dark:text-blue-400">Log in</Link>
      </p>
    </AuthCard>
  );
}
