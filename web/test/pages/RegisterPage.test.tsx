import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AuthProvider } from "../../src/context/AuthContext";
import RegisterPage from "../../src/pages/RegisterPage";

function renderRegisterPage() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<div>Home</div>} />
          <Route path="/resumes" element={<div>Resumes page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("RegisterPage", () => {
  it("submits credentials and navigates to the resumes onboarding step on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/auth/me") return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
        if (url === "/auth/register") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ username: "bob" }) });
        }
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    renderRegisterPage();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "bob" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ng!Pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() => expect(screen.getByText("Resumes page")).toBeInTheDocument());
  });

  it("shows an error message when the username is taken", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/auth/me") return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
        if (url === "/auth/register") {
          return Promise.resolve({ ok: false, json: () => Promise.resolve({ error: "username taken" }) });
        }
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    renderRegisterPage();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "bob" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ng!Pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("username taken");
  });
});
