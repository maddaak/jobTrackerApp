import { Suspense, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import AppNav from "../components/AppNav";
import { JobsProvider } from "../context/JobsContext";

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
  return (
    <JobsProvider key={season}>
      <div className="flex h-screen flex-col md:flex-row">
        <AppNav onSeasonChanged={seasons.onSeasonChanged} seasonsVersion={names} />
        {/* relative: a page's absolute sr-only input (the backup file picker) was placed against the
            document instead, stretching it so the whole app scrolled past the sidebar. */}
        <main className="relative min-h-0 min-w-0 flex-1 overflow-auto">
          {/* Here rather than around the routes, so the sidebar stays while a page's code loads. */}
          <Suspense fallback={<p className="p-6 text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>}>
            <Outlet context={seasons} />
          </Suspense>
        </main>
      </div>
    </JobsProvider>
  );
}
