import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { JobsProvider } from "../../src/context/JobsContext";
import AllJobsPage from "../../src/pages/AllJobsPage";

// AI off: the AI panels have their own tests.
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ aiConfigured: false }) }));

function summary(id: number, company: string, currentStage: string, outcome: string) {
  return {
    id, company, role: "Engineer", sourceCategory: "SELF_APPLIED", currentStage, interviewPhase: null, boardPhase: null, outcome,
    url: null, location: null, compMin: null, compMax: null, createdAt: "2026-01-01T00:00:00Z",
    latestInterview: null, links: [],
  };
}

describe("AllJobsPage", () => {
  it("shows every job in the table, wherever it sits in the pipeline", async () => {
    const jobs = [
      summary(1, "Applied Co", "RESUME_CHECK", "ACTIVE"),
      summary(2, "Panel Co", "INTERVIEW_STAGE", "ACTIVE"),
      summary(3, "Frozen Co", "INTERVIEW_STAGE", "PAUSED"),
      summary(4, "Rejected Co", "FINALIZED", "REJECTED"),
    ];
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(url === "/jobs" ? jobs : []),
    })));

    render(
      <MemoryRouter>
        <JobsProvider>
          <AllJobsPage />
        </JobsProvider>
      </MemoryRouter>,
    );

    for (const job of jobs) {
      expect(await screen.findByText(job.company)).toBeInTheDocument();
    }
  });
});
