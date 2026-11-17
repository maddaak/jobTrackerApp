import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AuthProvider } from "../../src/context/AuthContext";
import ProtectedRoute from "../../src/routes/ProtectedRoute";

function renderApp() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<div>Login Page</div>} />
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<div>Protected Content</div>} />
            <Route path="/seasons" element={<div>Lobby</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("ProtectedRoute", () => {
  it("redirects to /login when /auth/me says unauthenticated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));

    renderApp();

    expect(await screen.findByText("Login Page")).toBeInTheDocument();
  });

  it("renders the protected content when /auth/me says authenticated", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ username: "alice" }) }),
    );

    renderApp();

    expect(await screen.findByText("Protected Content")).toBeInTheDocument();
  });

  it("wraps protected pages in the nav so every page can reach every other", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ username: "alice" }) }),
    );

    renderApp();

    const nav = await screen.findByRole("navigation", { name: "Main" });
    // Prefix match: list links carry a live count after their label.
    for (const label of ["Board", "Calendar", "Insights", "Offers", "Submitted", "Paused", "Closed", "All jobs", "Resumes"]) {
      expect(within(nav).getByRole("link", { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    expect(within(nav).getByRole("link", { name: "Board" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("button", { name: "Log out" })).toBeInTheDocument();
    // The logo is the way back to the lobby, to start a new hunt or open a past one.
    expect(within(nav).getByRole("link", { name: "Job Tracker" })).toHaveAttribute("href", "/seasons");
  });

  // Signing in onto a finished hunt's board is a dead end; the lobby, with no sidebar, says what's next.
  it("opens on the lobby, without the sidebar, when the season shown is closed", async () => {
    const closed = { id: 4, name: "Spring hunt", createdAt: "2026-01-01T00:00:00Z", jobCount: 3, active: true,
      closedAt: "2026-04-20T15:00:00Z", acceptedJobId: null, firstApplied: null, lastApplied: null };
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true, status: 200, json: () => Promise.resolve(url === "/seasons" ? [closed] : { username: "alice" }),
    })));

    renderApp();

    expect(await screen.findByText("Lobby")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });

  it("does not render the nav when unauthenticated", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({}) }));

    renderApp();

    await screen.findByText("Login Page");
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });
});
