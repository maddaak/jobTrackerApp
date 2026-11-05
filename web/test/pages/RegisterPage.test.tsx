import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AuthProvider } from "../../src/context/AuthContext";
import RegisterPage from "../../src/pages/RegisterPage";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

let registered: unknown;

function stubFetch({ open = true, register = fakeResponse(200, { username: "bob" }) } = {}) {
  registered = undefined;
  vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
    if (url === "/auth/me") return Promise.resolve(fakeResponse(401, {}));
    if (url === "/auth/registration") return Promise.resolve(fakeResponse(200, { open }));
    if (url === "/auth/register") {
      registered = JSON.parse(init!.body as string);
      return Promise.resolve(register);
    }
    return Promise.resolve(fakeResponse(200, {}));
  }));
}

function renderRegisterPage() {
  return render(
    <MemoryRouter initialEntries={["/register"]}>
      <AuthProvider>
        <Routes>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/welcome" element={<div>Welcome page</div>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function fillIn() {
  fireEvent.change(await screen.findByLabelText("Name"), { target: { value: " Pat Lee " } });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "pat@example.com" } });
  fireEvent.change(screen.getByLabelText("Username"), { target: { value: "bob" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "Str0ng!Pass" } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Register" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Register" }));
}

describe("RegisterPage", () => {
  it("sends name, email, username, and password, then goes to the welcome steps", async () => {
    stubFetch();
    renderRegisterPage();

    await fillIn();

    await waitFor(() => expect(screen.getByText("Welcome page")).toBeInTheDocument());
    expect(registered).toEqual({ name: "Pat Lee", email: "pat@example.com", username: "bob", password: "Str0ng!Pass" });
  });

  it("shows core's reason when the account can't be made", async () => {
    stubFetch({ register: fakeResponse(409, { error: "username taken" }) });
    renderRegisterPage();

    await fillIn();

    expect(await screen.findByRole("alert")).toHaveTextContent("username taken");
  });

  // Once the app has its account, say so up front rather than after the form is filled in.
  it("says registration is closed, and how to open it, instead of showing the form", async () => {
    stubFetch({ open: false });
    renderRegisterPage();

    expect(await screen.findByText("Registration is closed")).toBeInTheDocument();
    expect(screen.getByText("REGISTRATION_OPEN=true")).toBeInTheDocument();
    expect(screen.queryByLabelText("Username")).not.toBeInTheDocument();
  });
});
