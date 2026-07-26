import { render, screen } from "@testing-library/react";
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
});
