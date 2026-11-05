import { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import AddJobForm from "./AddJobForm";
import Modal from "./Modal";
import SeasonSwitcher from "./SeasonSwitcher";
import QuickSearch from "./QuickSearch";
import ShortcutsHelp from "./ShortcutsHelp";
import { useAuth } from "../hooks/useAuth";
import { useJobsContext } from "../hooks/useJobsContext";
import { getUpdateStatus, RELEASES_URL } from "../api/updateApi";
import type { CreatedJob, JobSummary } from "../api/jobsApi";
import { isClosed, isPaused, isPendingOffer, isSubmitted } from "../jobPlacement";

interface NavItem {
  to: string;
  label: string;
  count?: (jobs: JobSummary[]) => number;
}

// The everyday pages up top, offers among them since an offer is the point of the whole search.
const PRIMARY: NavItem[] = [
  { to: "/", label: "Board" },
  { to: "/calendar", label: "Calendar" },
  { to: "/insights", label: "Insights" },
  { to: "/offers", label: "Offers", count: jobs => jobs.filter(isPendingOffer).length },
];

// Where jobs wait or rest, counted so a job that leaves the board is never lost from view.
const JOB_LISTS: NavItem[] = [
  { to: "/submitted", label: "Submitted", count: jobs => jobs.filter(isSubmitted).length },
  { to: "/paused", label: "Paused", count: jobs => jobs.filter(isPaused).length },
  { to: "/closed", label: "Closed", count: jobs => jobs.filter(isClosed).length },
  { to: "/all-jobs", label: "All jobs" },
];

const TOAST_MS = 6000;

// "G then B" style shortcuts: the second key has this long to follow the G.
const GO_WINDOW_MS = 1000;
const GO_TO: Record<string, string> = { b: "/", c: "/calendar", i: "/insights", a: "/all-jobs" };

interface Toast {
  message: string;
  link?: { to: string; label: string };
}

// NavLink resolves the active state and sets aria-current="page" itself.
function linkClass({ isActive }: { isActive: boolean }) {
  return [
    "flex items-center justify-between rounded-md px-3 py-1.5 text-sm font-medium",
    // A tint, not a solid fill, so the current page doesn't compete with the Add job button.
    isActive
      ? "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-200"
      : "text-neutral-700 hover:bg-neutral-200/60 dark:text-neutral-300 dark:hover:bg-neutral-800",
  ].join(" ");
}

// jobs is null until the first load, so a count is left out rather than shown as a confident 0.
function NavList({ items, jobs }: { items: NavItem[]; jobs: JobSummary[] | null }) {
  return (
    <ul className="flex flex-wrap gap-1 md:flex-col">
      {items.map(item => (
        <li key={item.to}>
          {/* "/" matches every route without `end`, so it would always look active. */}
          <NavLink to={item.to} end={item.to === "/"} className={linkClass}>
            {item.label}
            {item.count && jobs && (
              <span className="ml-3 min-w-6 rounded-full bg-black/5 px-1.5 text-center text-xs tabular-nums dark:bg-white/10">
                {item.count(jobs)}
              </span>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

export interface AppNavProps {
  onSeasonChanged: () => void;
  // Bumped when a season is renamed, so the picker reloads its names.
  seasonsVersion?: number;
}

export default function AppNav({ onSeasonChanged, seasonsVersion = 0 }: AppNavProps) {
  const { username, logout } = useAuth();
  const { jobs: allJobs, loaded, refresh } = useJobsContext();
  const jobs = loaded ? allJobs : null;
  const navigate = useNavigate();
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [searching, setSearching] = useState(false);
  const [showingShortcuts, setShowingShortcuts] = useState(false);

  useEffect(() => {
    let goPending = false;
    let goTimer: ReturnType<typeof setTimeout> | undefined;
    function handleKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      // An open dialog owns the keyboard, and so does a field being typed in, apart from Ctrl/Cmd K.
      if (target.closest("[role=dialog]")) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearching(true);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, select, [contenteditable=true]")) return;
      if (goPending) {
        goPending = false;
        const to = GO_TO[e.key.toLowerCase()];
        if (to) {
          e.preventDefault();
          navigate(to);
        }
        return;
      }
      const key = e.key.toLowerCase();
      if (e.key === "/") setSearching(true);
      else if (key === "n") setAdding(true);
      else if (e.key === "?") setShowingShortcuts(true);
      else if (key === "g") {
        goPending = true;
        clearTimeout(goTimer);
        goTimer = setTimeout(() => { goPending = false; }, GO_WINDOW_MS);
        return;
      } else return;
      e.preventDefault();
    }
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      clearTimeout(goTimer);
    };
  }, [navigate]);

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

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  // A new job lands on Submitted or the board, not necessarily the page you added it from, so say where.
  function handleCreated(job: CreatedJob) {
    setAdding(false);
    refresh();
    const onBoard = job.currentStage === "INTERVIEW_REQUEST";
    setToast({
      message: `Added ${job.company} to ${onBoard ? "the board" : "Submitted"}`,
      link: onBoard ? { to: "/", label: "View board" } : { to: "/submitted", label: "View Submitted" },
    });
  }

  return (
    <nav
      aria-label="Main"
      className="flex shrink-0 flex-col gap-4 border-b border-neutral-200 bg-neutral-50 px-3 py-4 md:w-60 md:border-b-0 md:border-r dark:border-neutral-800 dark:bg-neutral-900/40"
    >
      <span className="flex items-center gap-2 px-1 text-lg font-semibold">
        <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-blue-600 text-sm font-bold text-white">J</span>
        Job Tracker
      </span>

      <SeasonSwitcher key={seasonsVersion} onSwitched={onSeasonChanged} />

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
      >
        + Add job
      </button>

      <NavList items={PRIMARY} jobs={jobs} />

      <div>
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-neutral-400 dark:text-neutral-500">Jobs</p>
        <NavList items={JOB_LISTS} jobs={jobs} />
      </div>

      <div className="border-t border-neutral-200 pt-4 dark:border-neutral-800">
        <NavList
          items={[{ to: "/resumes", label: "Resumes" }, { to: "/profile", label: "Profile" }]}
          jobs={jobs}
        />
      </div>

      <div className="flex flex-col gap-2 text-sm md:mt-auto">
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
        <div className="flex items-center gap-2 border-t border-neutral-200 px-1 pt-3 dark:border-neutral-800">
          <span aria-hidden="true" className="grid size-7 shrink-0 place-items-center rounded-full bg-neutral-200 text-xs font-semibold uppercase text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
            {username?.charAt(0)}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium" title={`Logged in as ${username ?? ""}`}>{username}</span>
          <button
            onClick={handleLogout}
            className="rounded-md px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-200/60 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
          >
            Log out
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowingShortcuts(true)}
        className="hidden px-3 text-left text-xs text-neutral-500 hover:underline md:block dark:text-neutral-400"
      >
        Keyboard shortcuts (?)
      </button>

      {/* Opened through the board, whose dialog can show any job in the season, not just its own columns. */}
      <QuickSearch open={searching} jobs={allJobs} onClose={() => setSearching(false)} onPick={job => navigate(`/?job=${job.id}`)} />
      <ShortcutsHelp open={showingShortcuts} onClose={() => setShowingShortcuts(false)} />

      <Modal open={adding} onClose={() => setAdding(false)} title="Add job">
        <AddJobForm onCreated={handleCreated} onWarning={message => setToast({ message })} />
      </Modal>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-4 rounded-lg bg-neutral-900 px-4 py-3 text-sm text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900"
        >
          <span>{toast.message}</span>
          {toast.link && (
            <Link to={toast.link.to} onClick={() => setToast(null)} className="font-medium text-blue-300 hover:underline dark:text-blue-700">
              {toast.link.label} →
            </Link>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => setToast(null)} className="opacity-70 hover:opacity-100">
            ✕
          </button>
        </div>
      )}
    </nav>
  );
}
