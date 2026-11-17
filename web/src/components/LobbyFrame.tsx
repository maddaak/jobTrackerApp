import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

// The lobby's own page, with no sidebar: until a season is open there's no board or calendar to go to.
export default function LobbyFrame({ children }: { children: ReactNode }) {
  const { logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-white dark:bg-neutral-950">
      <header className="flex items-center justify-between px-6 py-4">
        <span className="flex items-center gap-2 text-lg font-semibold">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-md bg-blue-600 text-sm font-bold text-white">J</span>
          Job Tracker
        </span>
        <button type="button" onClick={handleLogout} className="text-sm text-neutral-600 hover:underline dark:text-neutral-300">
          Log out
        </button>
      </header>
      <main className="mx-auto max-w-2xl px-6 pb-12 pt-6">{children}</main>
    </div>
  );
}
