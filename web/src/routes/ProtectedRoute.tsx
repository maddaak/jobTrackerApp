import { Suspense, useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import AppNav from "../components/AppNav";
import { JobsProvider } from "../context/JobsContext";
import ClosedSeasonBanner from "../components/seasons/ClosedSeasonBanner";
import { listSeasons, type Season } from "../api/seasonsApi";

// What a page reaches through useOutletContext when it changes seasons itself, as Profile does.
export interface SeasonOutlet {
  // The season shown changed: every page reloads.
  onSeasonChanged: () => void;
  // Only names changed: the sidebar's picker reloads and the page stays as it is.
  onSeasonsRenamed: () => void;
}

export default function ProtectedRoute() {
  const { username, loading } = useAuth();
  // Every page loads data for the season shown, so switching remounts them all rather than each listening for it.
  const [season, setSeason] = useState(0);
  const [names, setNames] = useState(0);
  // The season shown when it's closed: read-only, which the banner says and the sidebar's Add job follows.
  const [closed, setClosed] = useState<Season | null>(null);

  const navigate = useNavigate();
  const { pathname } = useLocation();
  // The lobby stands alone: until a season is opened there's no board or calendar to go to.
  const inLobby = pathname === "/seasons";
  // Where the app opened, cleared once used, so only the first load can land elsewhere.
  const openedAt = useRef<string | null>(pathname);

  // Closing and reopening go through onSeasonChanged, so this reloads with everything else.
  useEffect(() => {
    if (!username) return;
    let ignore = false;
    listSeasons()
      .then(seasons => {
        if (ignore) return;
        const shownClosed = seasons.find(s => s.active && s.closedAt) ?? null;
        setClosed(shownClosed);
        // Signing in onto a finished hunt's board is a dead end; the lobby offers a new hunt or a past one.
        // Only on opening the app, so a closed season's board can still be opened on purpose.
        if (shownClosed && openedAt.current === "/") navigate("/seasons", { replace: true });
        openedAt.current = null;
      })
      // The pages report their own load errors; this is only a heads-up.
      .catch(() => {});
    return () => { ignore = true; };
  }, [username, season, navigate]);

  if (loading) {
    return null;
  }
  if (!username) {
    return <Navigate to="/login" replace />;
  }
  // Sidebar beside the page from md up; min-h-0/min-w-0 let the board and table scroll inside main
  // instead of stretching the page.
  const seasons: SeasonOutlet = {
    onSeasonChanged: () => setSeason(version => version + 1),
    onSeasonsRenamed: () => setNames(version => version + 1),
  };
  if (inLobby) {
    return (
      <Suspense fallback={<p className="p-6 text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>}>
        <Outlet context={seasons} />
      </Suspense>
    );
  }
  return (
    <JobsProvider key={season}>
      <div className="flex h-screen flex-col md:flex-row">
        <AppNav onSeasonChanged={seasons.onSeasonChanged} seasonsVersion={names} readOnly={closed !== null} />
        {/* relative: a page's absolute sr-only input (the backup file picker) was placed against the
            document instead, stretching it so the whole app scrolled past the sidebar. */}
        <main className="relative min-h-0 min-w-0 flex-1 overflow-auto">
          {closed && <ClosedSeasonBanner season={closed} onReopened={seasons.onSeasonChanged} />}
          {/* Here rather than around the routes, so the sidebar stays while a page's code loads. */}
          <Suspense fallback={<p className="p-6 text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>}>
            <Outlet context={seasons} />
          </Suspense>
        </main>
      </div>
    </JobsProvider>
  );
}
