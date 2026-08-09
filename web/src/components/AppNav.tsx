import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { getUpdateStatus, RELEASES_URL } from "../api/updateApi";

const LINKS = [
  { to: "/", label: "Jobs" },
  { to: "/calendar", label: "Calendar" },
  { to: "/metrics", label: "Metrics" },
  { to: "/resumes", label: "Resumes" },
];

// NavLink resolves the active state and sets aria-current="page" itself.
function linkClass({ isActive }: { isActive: boolean }) {
  return [
    "rounded px-3 py-1.5 text-sm font-medium",
    isActive
      ? "bg-blue-600 text-white"
      : "hover:bg-neutral-100 dark:hover:bg-neutral-800",
  ].join(" ");
}

export default function AppNav() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const [newVersion, setNewVersion] = useState<string | null>(null);

  useEffect(() => {
    // A convenience, not a feature of the app: if the check can't run, show nothing at all.
    let ignore = false;
    getUpdateStatus()
      .then(status => {
        if (!ignore && status.updateAvailable && status.latest) setNewVersion(status.latest);
      })
      .catch(() => {});
    return () => { ignore = true; };
  }, []);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <nav
      aria-label="Main"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-neutral-200 px-6 py-3 dark:border-neutral-800"
    >
      <span className="text-lg font-semibold">Job Tracker</span>

      <div className="flex flex-wrap items-center gap-1">
        {LINKS.map(link => (
          // "/" matches every route without `end`, so it would always look active.
          <NavLink key={link.to} to={link.to} end={link.to === "/"} className={linkClass}>
            {link.label}
          </NavLink>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-3 text-sm">
        {newVersion && (
          <a
            href={RELEASES_URL}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300"
          >
            {newVersion} available ↗
          </a>
        )}
        <span>Logged in as {username}</span>
        <button
          onClick={handleLogout}
          className="rounded border border-neutral-300 px-3 py-1 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Log out
        </button>
      </div>
    </nav>
  );
}
