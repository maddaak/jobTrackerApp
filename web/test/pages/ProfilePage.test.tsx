import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { AuthProvider } from "../../src/context/AuthContext";
import ProfilePage from "../../src/pages/ProfilePage";
import { JobsProvider } from "../../src/context/JobsContext";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

const NEVER_SET_UP = {
  emailConfigured: true, emailEnabled: false, email: null as string | null, timeZone: null as string | null,
  digest: true, digestHour: 8, interviewSoon: true, offerDeadline: true, followUp: false,
};

const EMAIL_ON = { ...NEVER_SET_UP, emailEnabled: true, email: "me@example.com", timeZone: "America/Chicago" };

let requests: { url: string; method: string; body: unknown }[];

const ACCOUNT = { username: "alice", name: "Pat Lee", email: "pat@example.com" };

function stubFetch(settings: typeof NEVER_SET_UP, testResponse = fakeResponse(200, { sent: true }),
  { account = ACCOUNT as { username: string; name: string | null; email: string | null }, passwordResponse = fakeResponse(200, { status: "ok" }),
    restoreResponse = fakeResponse(200, { jobs: 3, images: 1, resumes: 2 }) } = {}) {
  requests = [];
  let current = settings;
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
    const method = options?.method ?? "GET";
    const body = typeof options?.body === "string" ? JSON.parse(options.body) : null;
    requests.push({ url, method, body });
    if (url === "/auth/me") return Promise.resolve(fakeResponse(200, { username: "alice" }));
    if (url === "/account" && method === "PUT") return Promise.resolve(fakeResponse(200, { username: "alice", ...body }));
    if (url === "/account") return Promise.resolve(fakeResponse(200, account));
    if (url === "/account/password") return Promise.resolve(passwordResponse);
    if (url === "/account/restore") return Promise.resolve(restoreResponse);
    if (url === "/jobs") return Promise.resolve(fakeResponse(200, []));
    if (url === "/reminders/settings" && method === "PUT") {
      current = { ...current, ...body };
      return Promise.resolve(fakeResponse(200, current));
    }
    if (url === "/reminders/settings") return Promise.resolve(fakeResponse(200, current));
    if (url === "/reminders/test") return Promise.resolve(testResponse);
    return Promise.resolve(fakeResponse(200, {}));
  }));
}

// Inside an outlet like the app's, so the page can tell the sidebar its seasons changed.
function renderPage() {
  const onSeasonsRenamed = vi.fn();
  render(
    <MemoryRouter>
      <AuthProvider>
        <JobsProvider>
          <Routes>
            <Route element={<Outlet context={{ onSeasonChanged: vi.fn(), onSeasonsRenamed }} />}>
              <Route path="/" element={<ProfilePage />} />
            </Route>
          </Routes>
        </JobsProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
  return { onSeasonsRenamed };
}

// Account and Notifications each have a Save button.
const saveNotifications = () => fireEvent.click(
  within(screen.getByRole("heading", { name: "Notifications" }).closest("section")!).getByRole("button", { name: "Save" }));

const savedBody = (url = "/reminders/settings") => requests.find(r => r.method === "PUT" && r.url === url)?.body;

describe("ProfilePage account and password", () => {
  it("edits the name with no password asked", async () => {
    stubFetch(NEVER_SET_UP);
    renderPage();

    const account = (await screen.findByRole("heading", { name: "Account" })).closest("section")!;
    await waitFor(() => expect(within(account).getByLabelText("Name")).toHaveValue("Pat Lee"));
    fireEvent.change(within(account).getByLabelText("Name"), { target: { value: "Pat Q. Lee" } });
    expect(within(account).queryByLabelText("Current password")).not.toBeInTheDocument();
    fireEvent.click(within(account).getByRole("button", { name: "Save" }));

    expect(await within(account).findByRole("status")).toHaveTextContent("Saved.");
    expect(savedBody("/account")).toEqual({ name: "Pat Q. Lee", email: "pat@example.com" });
  });

  // Reset links go to this email, so moving it takes the password, as core requires.
  it("asks for the current password to change the email", async () => {
    stubFetch(NEVER_SET_UP);
    renderPage();

    const account = (await screen.findByRole("heading", { name: "Account" })).closest("section")!;
    await waitFor(() => expect(within(account).getByLabelText("Name")).toHaveValue("Pat Lee"));
    fireEvent.change(within(account).getByLabelText("Email"), { target: { value: " new@example.com " } });
    fireEvent.change(within(account).getByLabelText("Current password"), { target: { value: "Old!Passw0rd" } });
    fireEvent.click(within(account).getByRole("button", { name: "Save" }));

    expect(await within(account).findByRole("status")).toHaveTextContent("Saved.");
    expect(savedBody("/account")).toEqual({ name: "Pat Lee", email: "new@example.com", currentPassword: "Old!Passw0rd" });
    expect(within(account).queryByLabelText("Current password")).not.toBeInTheDocument();
  });

  it("asks an account from before V4 to add a name and email", async () => {
    stubFetch(NEVER_SET_UP, undefined, { account: { username: "alice", name: null, email: null } });
    renderPage();

    expect(await screen.findByText(/made before names and emails were asked for/)).toBeInTheDocument();
  });

  it("changes the password, checking the two new ones match first", async () => {
    stubFetch(NEVER_SET_UP);
    renderPage();

    const section = (await screen.findByRole("heading", { name: "Password" })).closest("section")!;
    fireEvent.change(within(section).getByLabelText("Current password"), { target: { value: "Old!Passw0rd" } });
    fireEvent.change(within(section).getByLabelText("New password"), { target: { value: "N3w!Password" } });
    fireEvent.change(within(section).getByLabelText("Confirm new password"), { target: { value: "different" } });
    fireEvent.click(within(section).getByRole("button", { name: "Change password" }));
    expect(await within(section).findByRole("alert")).toHaveTextContent("don't match");
    expect(savedBody("/account/password")).toBeUndefined();

    fireEvent.change(within(section).getByLabelText("Confirm new password"), { target: { value: "N3w!Password" } });
    fireEvent.click(within(section).getByRole("button", { name: "Change password" }));

    expect(await within(section).findByRole("status")).toHaveTextContent(
      "Password changed. Any other device signed in to this account has been signed out.");
    expect(savedBody("/account/password")).toEqual({ currentPassword: "Old!Passw0rd", newPassword: "N3w!Password" });
    expect(within(section).getByLabelText("Current password")).toHaveValue("");
  });

  // Without changing the password, and without filling in the form's required fields.
  it("signs out every other device on its own", async () => {
    stubFetch(NEVER_SET_UP);
    renderPage();

    const section = (await screen.findByRole("heading", { name: "Password" })).closest("section")!;
    fireEvent.click(within(section).getByRole("button", { name: "Sign out other devices" }));

    expect(await within(section).findByRole("status"))
      .toHaveTextContent("Every other device signed in to this account has been signed out.");
    expect(requests.find(r => r.url === "/account/sessions/end-others")).toMatchObject({ method: "POST" });
  });
});

describe("ProfilePage data", () => {
  const dataSection = async () => (await screen.findByRole("heading", { name: "Your data" })).closest("section")!;
  const chooseBackup = (section: HTMLElement) => fireEvent.change(
    within(section).getByText("Restore from a backup").querySelector("input")!,
    { target: { files: [new File(["{}"], "backup.json", { type: "application/json" })] } });

  it("downloads a backup from the export address", async () => {
    stubFetch(NEVER_SET_UP);
    renderPage();

    const link = within(await dataSection()).getByRole("link", { name: "Download a backup" });
    expect(link).toHaveAttribute("href", "/account/export");
    expect(link).toHaveAttribute("download");
  });

  // A restore can add seasons and switch to one, so the sidebar's picker reloads too.
  it("restores a backup, says what came back, and has the season picker reload", async () => {
    stubFetch(NEVER_SET_UP);
    const { onSeasonsRenamed } = renderPage();

    const section = await dataSection();
    chooseBackup(section);

    expect(await within(section).findByRole("status")).toHaveTextContent("Restored 3 jobs, 1 images, and 2 resumes.");
    expect(requests.some(r => r.url === "/account/restore" && r.method === "POST")).toBe(true);
    expect(onSeasonsRenamed).toHaveBeenCalled();
  });

  it("says why a restore was refused", async () => {
    stubFetch(NEVER_SET_UP, undefined, {
      restoreResponse: fakeResponse(409, { error: "restore only into an account with no jobs or resumes yet" }) });
    renderPage();

    const section = await dataSection();
    chooseBackup(section);

    expect(await within(section).findByRole("alert")).toHaveTextContent("no jobs or resumes yet");
  });
});

describe("ProfilePage", () => {
  it("shows the account and starts with email off, so nothing is sent until the person opts in", async () => {
    stubFetch(NEVER_SET_UP);
    renderPage();

    expect(await screen.findByText("alice")).toBeInTheDocument();
    expect(await screen.findByLabelText(/Email me notifications/)).not.toBeChecked();
    expect(screen.getByLabelText("Email address")).toBeDisabled();
    expect(screen.getByLabelText(/Daily digest/)).toBeDisabled();
  });

  it("turns email on with an address, the chosen kinds, and the browser's time zone", async () => {
    stubFetch(NEVER_SET_UP);
    renderPage();

    fireEvent.click(await screen.findByLabelText(/Email me notifications/));
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: " me@example.com " } });
    fireEvent.click(screen.getByLabelText(/Follow up/));
    fireEvent.change(screen.getByLabelText("Digest at"), { target: { value: "7" } });
    saveNotifications();

    expect(await screen.findByRole("status")).toHaveTextContent("Saved.");
    expect(savedBody()).toEqual({
      ...NEVER_SET_UP, emailEnabled: true, email: "me@example.com",
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, digestHour: 7, followUp: true,
    });
  });

  // Off keeps the address, so turning it back on doesn't mean typing it again.
  it("turns email off without losing the address", async () => {
    stubFetch(EMAIL_ON);
    renderPage();

    fireEvent.click(await screen.findByLabelText(/Email me notifications/));
    saveNotifications();

    expect(await screen.findByRole("status")).toHaveTextContent("You won't get any email");
    expect(savedBody()).toMatchObject({ emailEnabled: false, email: "me@example.com" });
  });

  // The test goes to the saved address, so it waits for a save rather than test the wrong one.
  it("sends a test only to a saved address and shows the mail server's reason when it fails", async () => {
    stubFetch(EMAIL_ON, fakeResponse(502, { error: "the mail server refused it: 535 authentication failed" }));
    renderPage();

    const test = await screen.findByRole("button", { name: "Send a test email" });
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "other@example.com" } });
    expect(test).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "me@example.com" } });
    fireEvent.click(test);

    expect(await screen.findByRole("alert")).toHaveTextContent("535 authentication failed");
  });

  it("warns that nothing will be sent when the server has no email settings, and offers no test", async () => {
    stubFetch({ ...EMAIL_ON, emailConfigured: false });
    renderPage();

    expect(await screen.findByText(/Email isn't set up on this server yet/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send a test email" })).toBeDisabled();
    await waitFor(() => expect(screen.getByLabelText("Time zone")).toHaveValue("America/Chicago"));
  });
});
