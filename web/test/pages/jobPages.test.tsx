import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { JobsProvider } from "../../src/context/JobsContext";
import BoardPage from "../../src/pages/BoardPage";
import ClosedPage from "../../src/pages/ClosedPage";
import PausedPage from "../../src/pages/PausedPage";
import SubmittedPage, { QUIET_AFTER_DAYS } from "../../src/pages/SubmittedPage";
import type { JobSummary } from "../../src/api/jobsApi";

// AI off: the AI panels have their own tests.
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ aiConfigured: false }) }));

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

let nextId = 0;
function job(company: string, overrides: Partial<JobSummary> = {}): JobSummary {
  return {
    id: ++nextId, company, role: "Engineer", sourceCategory: "SELF_APPLIED", currentStage: "RESUME_CHECK",
    interviewPhase: null, boardPhase: null, outcome: "ACTIVE", url: null, location: null, compMin: null, compMax: null,
    createdAt: "2026-01-01T00:00:00Z", latestInterview: null, needsScheduling: false, links: [], city: null,
    seasonId: 1, ...overrides,
  };
}

// One of each kind of job, so every page is checked against the jobs it must leave out.
const JOBS = [
  job("Applied Co"),
  job("Contacted Co", { currentStage: "INTERVIEW_REQUEST" }),
  // Undragged: placed by its rounds alone, so nothing is stored.
  job("Screen Co", { currentStage: "INTERVIEW_STAGE", boardPhase: "INITIAL_SCREEN" }),
  job("Panel Co", { currentStage: "WAITING_INTERVIEW_RESULTS", interviewPhase: "PANEL", boardPhase: "PANEL" }),
  job("Offer Co", { currentStage: "OFFER_STAGE" }),
  job("Rejected Co", { currentStage: "FINALIZED", outcome: "REJECTED" }),
  job("Ghosted Co", { currentStage: "FINALIZED", outcome: "GHOSTED" }),
  job("Frozen Co", { currentStage: "INTERVIEW_STAGE", interviewPhase: "MID_ROUNDS", boardPhase: "MID_ROUNDS", outcome: "PAUSED" }),
];

function stubFetch(patches: unknown[] = [], jobs: JobSummary[] = JOBS) {
  vi.stubGlobal("fetch", vi.fn((url: string, options?: RequestInit) => {
    if (url === "/jobs" && !options) return Promise.resolve(fakeResponse(200, jobs));
    if (url === "/interviews/upcoming") return Promise.resolve(fakeResponse(200, []));
    if (options?.method === "PATCH") {
      patches.push({ url, body: JSON.parse(options.body as string) });
      return Promise.resolve(fakeResponse(200, {}));
    }
    throw new Error(`unexpected fetch to ${url}`);
  }));
}

function renderPage(page: React.ReactElement) {
  return render(<MemoryRouter><JobsProvider>{page}</JobsProvider></MemoryRouter>);
}

describe("BoardPage", () => {
  it("puts each active job in its column and leaves submitted, offered, and closed jobs off the board", async () => {
    stubFetch();
    renderPage(<BoardPage />);

    const contacted = await screen.findByRole("region", { name: "Interview Request" });
    expect(within(contacted).getByText("Contacted Co")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Initial Screen" })).getByText("Screen Co")).toBeInTheDocument();
    const panel = screen.getByRole("region", { name: "Panel" });
    expect(within(panel).getByText("Panel Co")).toBeInTheDocument();
    expect(within(panel).getByText("Waiting on results")).toBeInTheDocument();
    for (const offBoard of ["Applied Co", "Offer Co", "Rejected Co", "Ghosted Co", "Frozen Co"]) {
      expect(screen.queryByText(offBoard)).not.toBeInTheDocument();
    }
  });
});

describe("BoardPage Submitted tray", () => {
  it("keeps submitted jobs closed away beside the board until opened", async () => {
    stubFetch();
    renderPage(<BoardPage />);

    const tray = await screen.findByRole("button", { name: "Show Submitted, 1" });
    expect(screen.queryByText("Applied Co")).not.toBeInTheDocument();
    fireEvent.click(tray);

    expect(within(screen.getByRole("region", { name: "Submitted" })).getByText("Applied Co")).toBeInTheDocument();
  });
});

describe("BoardPage keyboard", () => {
  const card = async (company: string) => (await screen.findByText(company)).closest("[role='button']") as HTMLElement;

  it("opens a card with Enter, since Space is the key that moves it", async () => {
    stubFetch();
    renderPage(<BoardPage />);

    fireEvent.keyDown(await card("Contacted Co"), { key: "Enter", code: "Enter" });

    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("doesn't open a card that Space has picked up to move", async () => {
    stubFetch();
    renderPage(<BoardPage />);
    const contacted = await card("Contacted Co");

    fireEvent.keyDown(contacted, { key: " ", code: "Space" });
    fireEvent.keyDown(contacted, { key: "Enter", code: "Enter" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("SubmittedPage", () => {
  it("lists only applications still waiting on a reply", async () => {
    stubFetch();
    renderPage(<SubmittedPage />);

    expect(await screen.findByText("Applied Co")).toBeInTheDocument();
    for (const other of ["Contacted Co", "Offer Co", "Rejected Co"]) {
      expect(screen.queryByText(other)).not.toBeInTheDocument();
    }
  });

  it("puts a job on the board when it gets an interview request", async () => {
    const patches: unknown[] = [];
    stubFetch(patches);
    renderPage(<SubmittedPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Got an interview request" }));

    await waitFor(() => expect(patches).toEqual([
      { url: `/jobs/${JOBS[0].id}`, body: expect.objectContaining({ currentStage: "INTERVIEW_REQUEST" }) },
    ]));
  });

  // Only applications quiet for QUIET_AFTER_DAYS are offered as ghosted; a recent one is left alone.
  it("offers to mark long-quiet applications ghosted, one or all at once", async () => {
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const jobs = [
      job("Quiet Co", { createdAt: daysAgo(QUIET_AFTER_DAYS + 5) }),
      job("Silent Co", { createdAt: daysAgo(QUIET_AFTER_DAYS) }),
      job("Recent Co", { createdAt: daysAgo(QUIET_AFTER_DAYS - 1) }),
    ];
    const patches: { url: string; body: { outcome: string } }[] = [];
    stubFetch(patches, jobs);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderPage(<SubmittedPage />);

    expect(await screen.findByText(/2 applications have had no reply/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark Quiet Co ghosted" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark Recent Co ghosted" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Mark all 2 ghosted" }));

    await waitFor(() => expect(patches.map(patch => patch.url).sort()).toEqual([`/jobs/${jobs[0].id}`, `/jobs/${jobs[1].id}`].sort()));
    expect(patches.every(patch => patch.body.outcome === "GHOSTED")).toBe(true);
  });
});

describe("PausedPage", () => {
  it("lists only paused jobs, with where each will resume", async () => {
    stubFetch();
    renderPage(<PausedPage />);

    expect(await screen.findByText("Frozen Co")).toBeInTheDocument();
    expect(screen.getByText("Resumes in Mid Rounds")).toBeInTheDocument();
    for (const other of ["Contacted Co", "Rejected Co", "Applied Co"]) {
      expect(screen.queryByText(other)).not.toBeInTheDocument();
    }
  });

  it("resumes a job as active, keeping its stage and column", async () => {
    const patches: unknown[] = [];
    stubFetch(patches);
    renderPage(<PausedPage />);

    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));

    const frozen = JOBS.find(candidate => candidate.company === "Frozen Co")!;
    await waitFor(() => expect(patches).toEqual([{
      url: `/jobs/${frozen.id}`,
      body: expect.objectContaining({ outcome: "ACTIVE", currentStage: "INTERVIEW_STAGE", interviewPhase: "MID_ROUNDS" }),
    }]));
  });
});

describe("ClosedPage", () => {
  it("lists every closed job and narrows to one outcome", async () => {
    stubFetch();
    renderPage(<ClosedPage />);

    expect(await screen.findByText("Rejected Co")).toBeInTheDocument();
    expect(screen.getByText("Ghosted Co")).toBeInTheDocument();
    expect(screen.queryByText("Offer Co")).not.toBeInTheDocument();

    const ghosted = within(screen.getByRole("group", { name: "Outcome" })).getByRole("button", { name: /Ghosted/ });
    fireEvent.click(ghosted);

    expect(ghosted).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Rejected Co")).not.toBeInTheDocument();
    expect(screen.getByText("Ghosted Co")).toBeInTheDocument();
  });
});
