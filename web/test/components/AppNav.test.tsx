import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AppNav from "../../src/components/AppNav";
import { AuthProvider } from "../../src/context/AuthContext";

// Answers per URL: AppNav's own update check plus AuthProvider's /auth/me and /ai-status.
function mockFetch(updateStatus: unknown, updateOk = true) {
  return vi.fn((url: string) => {
    if (String(url).startsWith("/update-status")) {
      return Promise.resolve({ ok: updateOk, status: updateOk ? 200 : 500, json: () => Promise.resolve(updateStatus) });
    }
    if (String(url).startsWith("/auth/me")) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ username: "alice" }) });
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ aiConfigured: false }) });
  });
}

function renderNav() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <AppNav />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AppNav update check", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("links to the releases page when a newer version exists", async () => {
    vi.stubGlobal("fetch", mockFetch({ current: "v3", latest: "v3.1", updateAvailable: true }));

    renderNav();

    const link = await screen.findByRole("link", { name: /v3\.1 available/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("/releases"));
  });

  it("shows nothing when the running version is current", async () => {
    vi.stubGlobal("fetch", mockFetch({ current: "v3", latest: "v3", updateAvailable: false }));

    renderNav();

    await screen.findByText("Jobs");
    expect(screen.queryByRole("link", { name: /available/ })).not.toBeInTheDocument();
  });

  it("stays silent when the check itself fails, since it is a convenience", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "boom" }, false));

    renderNav();

    await screen.findByText("Jobs");
    await waitFor(() => expect(screen.queryByRole("link", { name: /available/ })).not.toBeInTheDocument());
  });
});
