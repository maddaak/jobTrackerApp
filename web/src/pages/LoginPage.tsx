import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import AuthCard, { authButtonClass, authInputClass, authLabelClass } from "../components/AuthCard";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "login failed");
    }
  }

  return (
    <AuthCard title="Log in">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="username" className={authLabelClass}>Username</label>
          <input id="username" autoComplete="username" className={authInputClass} value={username} onChange={e => setUsername(e.target.value)} />
        </div>
        <div>
          <label htmlFor="password" className={authLabelClass}>Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            className={authInputClass}
            value={password}
            onChange={e => setPassword(e.target.value)}
          />
        </div>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button type="submit" className={authButtonClass}>Log in</button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link to="/forgot-password" className="text-blue-600 hover:underline dark:text-blue-400">Forgot password?</Link>
      </p>
      <p className="mt-2 text-center text-sm">
        No account? <Link to="/register" className="text-blue-600 hover:underline dark:text-blue-400">Register</Link>
      </p>
    </AuthCard>
  );
}
