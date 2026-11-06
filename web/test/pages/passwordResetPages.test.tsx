import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import ForgotPasswordPage from "../../src/pages/ForgotPasswordPage";
import ResetPasswordPage from "../../src/pages/ResetPasswordPage";
import { TERMINAL_RESET_COMMAND } from "../../src/api/accountApi";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

describe("ForgotPasswordPage", () => {
  it("asks for a link without saying whether the account exists, and always offers the terminal reset", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse(202, { status: "accepted" }))));
    render(<MemoryRouter><ForgotPasswordPage /></MemoryRouter>);

    expect(screen.getByText(TERMINAL_RESET_COMMAND)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Username"), { target: { value: " pat " } });
    fireEvent.click(screen.getByRole("button", { name: "Email me a reset link" }));

    expect(await screen.findByRole("status")).toHaveTextContent("If email is set up");
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ username: "pat" });
  });
});

describe("ResetPasswordPage", () => {
  const renderAt = (url: string) => render(<MemoryRouter initialEntries={[url]}><ResetPasswordPage /></MemoryRouter>);

  it("sets the new password from the emailed token", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse(200, { status: "ok" }))));
    renderAt("/reset-password?token=abc123");

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "N3w!Password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "N3w!Password" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByText("Password changed")).toBeInTheDocument();
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toEqual({ token: "abc123", newPassword: "N3w!Password" });
  });

  it("shows why an expired link didn't work", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse(400, { error: "this reset link is invalid or has expired: ask for a new one" }))));
    renderAt("/reset-password?token=old");

    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "N3w!Password" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "N3w!Password" } });
    fireEvent.click(screen.getByRole("button", { name: "Set new password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("expired");
  });

  it("says a link with no token is incomplete instead of showing a form that can't work", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderAt("/reset-password");

    expect(screen.getByText("This link is incomplete")).toBeInTheDocument();
    expect(screen.queryByLabelText("New password")).not.toBeInTheDocument();
  });
});
