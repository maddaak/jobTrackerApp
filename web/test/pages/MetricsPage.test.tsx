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
            sankeyLinks: [{ source: "RESUME_CHECK", target: "INTERVIEW_REQUEST", value: 2 }],
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

    expect(await screen.findByText(/No pipeline flow yet/)).toBeInTheDocument();
  });

  it("labels stage/outcome ids with their human-readable name", () => {
    expect(nodeLabel("RESUME_CHECK")).toBe("Resume Check");
    expect(nodeLabel("REJECTED")).toBe("Rejected");
  });

  it("labels the interview-journey nodes (types, panel, offer splits)", () => {
    expect(nodeLabel("SYSTEM_DESIGN")).toBe("System Design");
    expect(nodeLabel("PANEL")).toBe("Panel");
    expect(nodeLabel("OFFER")).toBe("Offer");
    expect(nodeLabel("ACCEPTED")).toBe("Accepted");
    expect(nodeLabel("DECLINED")).toBe("Declined");
  });

  it("sizes each node by its actual flow through the chart (max of in/out)", () => {
    const data = toSankeyData({
      funnel: [
        { stage: "RESUME_CHECK", count: 3 },
        { stage: "INTERVIEW_REQUEST", count: 2 },
      ],
      outcomeCounts: [],
      interviewRoundCounts: [],
      sankeyLinks: [{ source: "RESUME_CHECK", target: "INTERVIEW_REQUEST", value: 2 }],
    });

    expect(data.nodes.map(n => n.name)).toEqual(["Resume Check", "Interview Request"]);
    expect(data.nodes.map(n => n.total)).toEqual([2, 2]);
  });

  it("keeps every flow, including the direct Resume Check close", () => {
    const data = toSankeyData({
      funnel: [{ stage: "RESUME_CHECK", count: 1 }],
      outcomeCounts: [{ outcome: "REJECTED", count: 1 }],
      interviewRoundCounts: [],
      sankeyLinks: [{ source: "RESUME_CHECK", target: "REJECTED", value: 1 }],
    });

    expect(data.nodes.map(n => n.name)).toEqual(["Resume Check", "Rejected"]);
    expect(data.nodes.map(n => n.total)).toEqual([1, 1]);
    expect(data.links).toHaveLength(1);
  });

  it("totals a node across all of its links (in and out)", () => {
    const data = toSankeyData({
      funnel: [],
      outcomeCounts: [],
      interviewRoundCounts: [],
      sankeyLinks: [
        { source: "RESUME_CHECK", target: "REJECTED", value: 30 },
        { source: "RESUME_CHECK", target: "INTERVIEW_REQUEST", value: 5 },
        { source: "INTERVIEW_REQUEST", target: "REJECTED", value: 5 },
      ],
    });

    expect(data.nodes.find(n => n.name === "Resume Check")?.total).toBe(35);
    expect(data.nodes.find(n => n.name === "Rejected")?.total).toBe(35);
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
