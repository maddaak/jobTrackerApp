import { render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SeasonSummaryPage from "../../src/pages/SeasonSummaryPage";
import type { SeasonSummary } from "../../src/api/metricsApi";

const SUMMARY: SeasonSummary = {
  seasonId: 4,
  name: "Spring hunt",
  closedAt: "2026-04-20T15:00:00Z",
  firstApplied: "2026-03-02T15:00:00Z",
  applications: 18,
  averageResponseDays: 9.5,
  responsesMeasured: 6,
  closedApplications: 9,
  roundsPassed: 7,
  roundsFailed: 3,
  rounds: [{ roundNode: "BEHAVIOR", count: 4, passed: 3, notPassed: 1, passedJobs: [], notPassedJobs: [] }],
  acceptedOffer: {
    jobId: 8, company: "Globex", role: "Staff Engineer", applied: "2026-03-05T15:00:00Z",
    acceptedOn: "2026-04-15", startsOn: "2026-05-04", daysToAccept: 41,
  },
  offers: [],
};

function renderPage(summary: SeasonSummary) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(summary) })));
  return render(
    <MemoryRouter initialEntries={["/seasons/4/summary"]}>
      <Routes>
        <Route path="/seasons/:id/summary" element={<SeasonSummaryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe("SeasonSummaryPage", () => {
  it("shows how the hunt went: response time, rounds, and the offer taken from application to start", async () => {
    renderPage(SUMMARY);

    expect(await screen.findByRole("heading", { name: "Spring hunt" })).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe("/metrics/seasons/4/summary");
    expect(screen.getByText("9.5 days")).toBeInTheDocument();
    expect(screen.getByText(/from 6 of 9 with a date/)).toBeInTheDocument();
    expect(screen.getByText("Rounds passed").nextSibling).toHaveTextContent("7");
    expect(screen.getByText("Rounds not passed").nextSibling).toHaveTextContent("3");
    const offer = screen.getByText("Globex").parentElement!;
    expect(within(offer).getByText("Staff Engineer")).toBeInTheDocument();
    expect(within(offer).getByText("(41 days after applying)")).toBeInTheDocument();
  });

  // A YYYY-MM-DD read as UTC midnight shows the day before anywhere west of UTC.
  it("shows the days entered as those calendar days", async () => {
    renderPage(SUMMARY);

    const offer = (await screen.findByText("Globex")).parentElement!;
    const day = (iso: string) => {
      const [year, month, date] = iso.split("-").map(Number);
      return new Date(year, month - 1, date).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
    };
    expect(within(offer).getByText(day("2026-04-15"))).toBeInTheDocument();
    expect(within(offer).getByText(day("2026-05-04"))).toBeInTheDocument();
  });

  it("says when a hunt ended without an offer, and when nothing has been measured yet", async () => {
    renderPage({ ...SUMMARY, acceptedOffer: null, averageResponseDays: null, responsesMeasured: 0 });

    expect(await screen.findByText("This hunt ended without an offer accepted.")).toBeInTheDocument();
    expect(screen.getByText("None yet")).toBeInTheDocument();
  });
});
