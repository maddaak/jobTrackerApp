import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AuthProvider } from "../../src/context/AuthContext";
import HomePage from "../../src/pages/HomePage";

function renderHomePage() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<div>Login Page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

function stubFetch() {
  let jobs: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, options?: RequestInit) => {
      if (url === "/auth/me") {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ username: "alice" }) });
      }
      if (url === "/jobs" && !options) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(jobs) });
      }
      if (url === "/jobs" && options?.method === "POST") {
        const body = JSON.parse(options.body as string);
        const job = { id: 1, ...body, currentStage: "RESUME_CHECK", outcome: "ACTIVE", rejectedReason: null, createdAt: "2026-01-01T00:00:00Z" };
        jobs = [job];
        return Promise.resolve({ ok: true, json: () => Promise.resolve(job) });
      }
      throw new Error(`unexpected fetch to ${url} ${options?.method ?? "GET"}`);
    }),
  );
}

describe("HomePage", () => {
  it("opens the Add job modal, and submitting inside it closes the modal and refreshes the jobs list", async () => {
    stubFetch();
    renderHomePage();

    await screen.findByText("Logged in as alice");
    expect(screen.queryByLabelText("Company")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add job" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Skip — enter manually" }));
    expect(screen.getByLabelText("Company")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Company"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Engineer" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add job" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(await screen.findByText("Acme")).toBeInTheDocument();
  });
});
