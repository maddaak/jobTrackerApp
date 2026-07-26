import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import MetricsPage, { nodeLabel, toSankeyData } from "../../src/pages/MetricsPage";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

function renderMetricsPage() {
  return render(
    <MemoryRouter>
      <MetricsPage />
    </MemoryRouter>,
  );
}

describe("MetricsPage", () => {
  it("renders the funnel table with human-readable stage labels", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [
              { stage: "RESUME_CHECK", count: 3 },
              { stage: "INTERVIEW_STAGE", count: 1 },
            ],
            outcomeCounts: [],
            interviewRoundCounts: [],
            sankeyLinks: [{ source: "RESUME_CHECK", target: "RECRUITER_CHAT_INVITE", value: 2 }],
          }),
        ),
      ),
    );

    renderMetricsPage();

    expect(await screen.findByText("Resume Check")).toBeInTheDocument();
    expect(screen.getByText("Interview Stage")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("appends outcome rows (e.g. Rejected) to the funnel table", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 3 }],
            outcomeCounts: [
              { outcome: "REJECTED", count: 2 },
              { outcome: "GHOSTED", count: 0 },
            ],
            interviewRoundCounts: [],
            sankeyLinks: [],
          }),
        ),
      ),
    );

    renderMetricsPage();

    expect(await screen.findByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("Ghosted")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("shows a placeholder message instead of the chart when there are no links yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            outcomeCounts: [],
            interviewRoundCounts: [],
            sankeyLinks: [],
          }),
        ),
      ),
    );

    renderMetricsPage();

    expect(await screen.findByText(/No jobs have moved past Resume Check yet/)).toBeInTheDocument();
  });

  it("labels stage/outcome ids with their human-readable name", () => {
    expect(nodeLabel("RESUME_CHECK")).toBe("Resume Check");
    expect(nodeLabel("REJECTED")).toBe("Rejected");
  });

  it("appends the funnel's true reached-count to a stage node's label, so it never looks smaller than the funnel table for the same stage", () => {
    const data = toSankeyData({
      funnel: [
        { stage: "RESUME_CHECK", count: 3 },
        { stage: "RECRUITER_CHAT_INVITE", count: 2 },
      ],
      outcomeCounts: [],
      interviewRoundCounts: [],
      sankeyLinks: [{ source: "RESUME_CHECK", target: "RECRUITER_CHAT_INVITE", value: 2 }],
    });

    expect(data.nodes.map(n => n.name)).toEqual(["Resume Check (3)", "Recruiter Chat Invite (2)"]);
  });

  it("does not append a count to outcome node labels", () => {
    const data = toSankeyData({
      funnel: [{ stage: "RESUME_CHECK", count: 1 }],
      outcomeCounts: [{ outcome: "REJECTED", count: 1 }],
      interviewRoundCounts: [],
      sankeyLinks: [{ source: "RESUME_CHECK", target: "REJECTED", value: 1 }],
    });

    expect(data.nodes.map(n => n.name)).toEqual(["Resume Check (1)", "Rejected"]);
  });

  it("shows interview round counts by type, with a total, and hides zero-count types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            outcomeCounts: [],
            interviewRoundCounts: [
              { interviewType: "SYSTEM_DESIGN", count: 2 },
              { interviewType: "BEHAVIOR", count: 1 },
              { interviewType: "VALUES", count: 0 },
            ],
            sankeyLinks: [],
          }),
        ),
      ),
    );

    renderMetricsPage();

    expect(await screen.findByText("System Design")).toBeInTheDocument();
    expect(screen.getByText("Behavior")).toBeInTheDocument();
    expect(screen.queryByText("Values")).not.toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows a placeholder instead of the interview rounds table when no rounds have been scheduled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            outcomeCounts: [],
            interviewRoundCounts: [{ interviewType: "SYSTEM_DESIGN", count: 0 }],
            sankeyLinks: [],
          }),
        ),
      ),
    );

    renderMetricsPage();

    expect(await screen.findByText("No interview rounds scheduled yet.")).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(fakeResponse(500, {}))));

    renderMetricsPage();

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("failed to load metrics"));
  });
});
