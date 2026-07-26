import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AuthProvider } from "../../src/context/AuthContext";
import LoginPage from "../../src/pages/LoginPage";

function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<div>Home</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("LoginPage", () => {
  it("submits credentials and navigates home on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/auth/me") return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
        if (url === "/auth/login") {
          return Promise.resolve({ ok: true, json: () => Promise.resolve({ username: "alice" }) });
        }
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    renderLoginPage();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ng!Pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(screen.getByText("Home")).toBeInTheDocument());
  });

  it("shows an error message on failed login", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url === "/auth/me") return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
        if (url === "/auth/login") {
          return Promise.resolve({
            ok: false,
            json: () => Promise.resolve({ error: "invalid username or password" }),
          });
        }
        throw new Error(`unexpected fetch to ${url}`);
      }),
    );

    renderLoginPage();

    fireEvent.change(screen.getByLabelText("Username"), { target: { value: "alice" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("invalid username or password");
  });
});
