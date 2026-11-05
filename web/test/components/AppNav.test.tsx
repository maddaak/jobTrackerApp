import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import AppNav from "../../src/components/AppNav";
import { AuthProvider } from "../../src/context/AuthContext";
import { JobsProvider } from "../../src/context/JobsContext";

function summary(id: number, company: string, currentStage: string, outcome = "ACTIVE") {
  return {
    id, company, role: "Engineer", sourceCategory: "SELF_APPLIED", currentStage, interviewPhase: null, boardPhase: null, outcome,
    url: null, location: null, compMin: null, compMax: null, createdAt: "2026-01-01T00:00:00Z",
    latestInterview: null, links: [],
  };
}

const JOBS = [
  summary(1, "Applied One", "RESUME_CHECK"),
  summary(2, "Applied Two", "RESUME_CHECK"),
  summary(3, "Offer Co", "OFFER_STAGE"),
  summary(4, "Frozen Co", "INTERVIEW_STAGE", "PAUSED"),
  summary(5, "Rejected Co", "FINALIZED", "REJECTED"),
];

let created: unknown[] = [];

// Answers per URL: AppNav's update check and job list, plus AuthProvider's /auth/me and /ai-status.
function mockFetch(updateStatus: unknown, updateOk = true) {
  created = [];
  return vi.fn((url: string, options?: RequestInit) => {
    const reply = (body: unknown, ok = true) =>
      Promise.resolve({ ok, status: ok ? 200 : 500, json: () => Promise.resolve(body) });
    if (String(url).startsWith("/update-status")) return reply(updateStatus, updateOk);
    if (url === "/auth/me") return reply({ username: "alice" });
    if (url === "/jobs" && options?.method === "POST") {
      const body = JSON.parse(options.body as string);
      created.push(body);
      return reply(summary(9, body.company, body.startingStage ?? "RESUME_CHECK"));
    }
    if (url === "/jobs") return reply(JOBS);
    if (url === "/seasons") return reply([]);
    return reply({ aiConfigured: false });
  });
}

function renderNav() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <JobsProvider>
          <AppNav onSeasonChanged={() => {}} />
        </JobsProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

async function addJob(company: string, recruiterReachedOut: boolean) {
  fireEvent.click(await screen.findByRole("button", { name: "+ Add job" }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Skip — enter manually" }));
  fireEvent.change(screen.getByLabelText("Company"), { target: { value: company } });
  fireEvent.change(screen.getByLabelText("Role"), { target: { value: "Engineer" } });
  if (recruiterReachedOut) fireEvent.click(screen.getByLabelText("A recruiter reached out"));
  fireEvent.click(within(dialog).getByRole("button", { name: "Add job" }));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("AppNav", () => {
  it("counts the jobs waiting on each list, so a job that leaves the board is never lost from view", async () => {
    vi.stubGlobal("fetch", mockFetch({ updateAvailable: false }));

    renderNav();

    expect(await screen.findByRole("link", { name: /^Submitted\s*2$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Offers\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Paused\s*1$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /^Closed\s*1$/ })).toBeInTheDocument();
  });

  it("says a new job went to Submitted, with a way to get there", async () => {
    vi.stubGlobal("fetch", mockFetch({ updateAvailable: false }));
    renderNav();

    await addJob("Acme", false);

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Added Acme to Submitted");
    expect(within(toast).getByRole("link", { name: /View Submitted/ })).toHaveAttribute("href", "/submitted");
    expect(created).toEqual([expect.not.objectContaining({ startingStage: expect.anything() })]);
  });

  it("starts a job a recruiter reached out about on the board", async () => {
    vi.stubGlobal("fetch", mockFetch({ updateAvailable: false }));
    renderNav();

    await addJob("Globex", true);

    expect(await screen.findByRole("status")).toHaveTextContent("Added Globex to the board");
    expect(created).toEqual([expect.objectContaining({ startingStage: "INTERVIEW_REQUEST" })]);
  });
});

describe("AppNav update check", () => {
  it("links to the releases page when a newer version exists", async () => {
    vi.stubGlobal("fetch", mockFetch({ current: "v3", latest: "v3.1", updateAvailable: true }));

    renderNav();

    const link = await screen.findByRole("link", { name: /v3\.1 available/ });
    expect(link).toHaveAttribute("href", expect.stringContaining("/releases"));
  });

  it("shows nothing when the running version is current", async () => {
    vi.stubGlobal("fetch", mockFetch({ current: "v3", latest: "v3", updateAvailable: false }));

    renderNav();

    await screen.findByText("Board");
    expect(screen.queryByRole("link", { name: /available/ })).not.toBeInTheDocument();
  });

  it("stays silent when the check itself fails, since it is a convenience", async () => {
    vi.stubGlobal("fetch", mockFetch({ error: "boom" }, false));

    renderNav();

    await screen.findByText("Board");
    await waitFor(() => expect(screen.queryByRole("link", { name: /available/ })).not.toBeInTheDocument());
  });
});

describe("AppNav keyboard shortcuts", () => {
  function Where() {
    const location = useLocation();
    return <p data-testid="where">{location.pathname}{location.search}</p>;
  }

  function renderWithLocation() {
    vi.stubGlobal("fetch", mockFetch({ updateAvailable: false }));
    return render(
      <MemoryRouter initialEntries={["/submitted"]}>
        <AuthProvider>
          <JobsProvider>
            <AppNav onSeasonChanged={() => {}} />
            <input aria-label="Some field" />
            <Where />
          </JobsProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
  }

  it("finds a job by typing and opens it on the board", async () => {
    renderWithLocation();
    await screen.findByRole("link", { name: /^Submitted\s*2$/ });

    fireEvent.keyDown(document.body, { key: "/" });
    fireEvent.change(screen.getByLabelText("Search jobs"), { target: { value: "offer" } });
    expect(screen.getAllByRole("option")).toHaveLength(1);
    fireEvent.keyDown(screen.getByLabelText("Search jobs"), { key: "Enter" });

    expect(screen.getByTestId("where")).toHaveTextContent("/?job=3");
  });

  it("adds a job with N and moves between pages with G then a letter", async () => {
    renderWithLocation();
    await screen.findByRole("link", { name: /^Submitted\s*2$/ });

    fireEvent.keyDown(document.body, { key: "g" });
    fireEvent.keyDown(document.body, { key: "c" });
    expect(screen.getByTestId("where")).toHaveTextContent("/calendar");

    fireEvent.keyDown(document.body, { key: "n" });
    expect(within(screen.getByRole("dialog")).getByText("Add job")).toBeInTheDocument();
  });

  // Typing an "n" into a field must type it, not open a dialog.
  it("leaves keys alone while typing in a field, apart from Ctrl K", () => {
    renderWithLocation();

    const field = screen.getByLabelText("Some field");
    fireEvent.keyDown(field, { key: "n" });
    fireEvent.keyDown(field, { key: "/" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.keyDown(field, { key: "k", ctrlKey: true });
    expect(screen.getByLabelText("Search jobs")).toBeInTheDocument();
  });
});
