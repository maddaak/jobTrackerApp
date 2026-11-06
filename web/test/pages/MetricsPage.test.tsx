import { render, screen, waitFor, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import MetricsPage from "../../src/pages/MetricsPage";
import { nodeLabel, toSankeyData } from "../../src/sankeyNodes";

// AI off: the AI panels have their own tests.
vi.mock("../../src/hooks/useAuth", () => ({ useAuth: () => ({ aiConfigured: false }) }));

// Zeros, so no tile figure collides with a number a table test looks for.
const SUMMARY = { totalJobs: 0, activeJobs: 0, inInterviews: 0, interviewsDone: 0, interviewsUpcoming: 0 };

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
            summary: SUMMARY,
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
            summary: SUMMARY,
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

  it("headlines the totals, the response rate, and the pass rate of decided rounds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            summary: { totalJobs: 40, activeJobs: 12, inInterviews: 5, interviewsDone: 18, interviewsUpcoming: 2 },
            funnel: [
              { stage: "RESUME_CHECK", count: 40 },
              { stage: "INTERVIEW_REQUEST", count: 10 },
              { stage: "OFFER_STAGE", count: 1 },
            ],
            outcomeCounts: [],
            interviewRoundCounts: [
              { roundNode: "SYSTEM_DESIGN", count: 5, passed: 3, notPassed: 1, passedJobs: [], notPassedJobs: [] },
            ],
            sankeyLinks: [],
          }),
        ),
      ),
    );

    renderMetricsPage();

    await screen.findByText("Applications");
    const tile = (label: string) => screen.getByText(label).parentElement!;
    expect(within(tile("Applications")).getByText("40")).toBeInTheDocument();
    expect(within(tile("Response rate")).getByText("25%")).toBeInTheDocument();
    expect(within(tile("Interviews")).getByText("2 upcoming")).toBeInTheDocument();
    // 3 passed of 4 decided; the fifth round is still open and counts neither way.
    expect(within(tile("Round pass rate")).getByText("75%")).toBeInTheDocument();
  });

  it("keeps the pipeline flow as a secondary, collapsed section", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            summary: SUMMARY,
            funnel: [],
            outcomeCounts: [],
            interviewRoundCounts: [],
            sankeyLinks: [{ source: "RESUME_CHECK", target: "INTERVIEW_REQUEST", value: 2 }],
          }),
        ),
      ),
    );

    renderMetricsPage();

    const flow = (await screen.findByText("Pipeline flow")).closest("details")!;
    expect(flow).not.toHaveAttribute("open");
  });

  // The chart's own tests cover hovering and pinning; this checks the page hands it core's routes and companies.
  it("shows a stage's companies from core's routes, labelled for people, in the space under the chart", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            summary: SUMMARY,
            funnel: [],
            outcomeCounts: [],
            interviewRoundCounts: [],
            sankeyLinks: [{ source: "RESUME_CHECK", target: "INTERVIEW_REQUEST", value: 2 }],
            sankeyPaths: [{ nodes: ["RESUME_CHECK", "INTERVIEW_REQUEST"], jobs: 2, applications: [
              { jobId: 1, company: "Initech", role: "Engineer", postings: 1 },
              { jobId: 2, company: "Globex", role: "Engineer", postings: 1 }] }],
          }),
        ),
      ),
    );
    // The chart draws only once its container has a width, which jsdom never reports on its own.
    vi.stubGlobal("ResizeObserver", class {
      report: ResizeObserverCallback;
      constructor(report: ResizeObserverCallback) { this.report = report; }
      observe() { this.report([{ contentRect: { width: 900 } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
      disconnect() {}
    });

    renderMetricsPage();
    fireEvent.click(await screen.findByText("Pipeline flow"));
    fireEvent.click(await screen.findByRole("button", { name: "Interview Request, 2" }));

    expect(screen.getByText("Interview Request · 2 jobs")).toBeInTheDocument();
    const listed = within(screen.getByRole("list", { name: "Companies at Interview Request" })).getAllByRole("listitem");
    expect(listed.map(item => item.textContent)).toEqual(["Globex", "Initech"]);
  });

  // Three postings, one pursuit: the flow starts one journey while the tiles count three applications.
  it("says when reposts are drawn as one journey, so the flow's total matches the tiles", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            summary: { ...SUMMARY, totalJobs: 3 },
            funnel: [],
            outcomeCounts: [],
            interviewRoundCounts: [],
            sankeyLinks: [{ source: "RESUME_CHECK", target: "INTERVIEW_REQUEST", value: 1 }],
            sankeyPaths: [{ nodes: ["RESUME_CHECK", "INTERVIEW_REQUEST"], jobs: 1,
              applications: [{ jobId: 3, company: "Initech", role: "Engineer", postings: 3 }] }],
          }),
        ),
      ),
    );

    renderMetricsPage();
    fireEvent.click(await screen.findByText("Pipeline flow"));

    expect(screen.getByText(/drawn as one journey: 1 journey from 3 applications/)).toBeInTheDocument();
  });

  it("shows a placeholder message instead of the chart when there are no links yet", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            summary: SUMMARY,
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
      sankeyLinks: [{ source: "RESUME_CHECK", target: "INTERVIEW_REQUEST", value: 2 }],
      sankeyNodeOrder: [],
    });

    expect(data.nodes.map(n => n.name)).toEqual(["Resume Check", "Interview Request"]);
    expect(data.nodes.map(n => n.total)).toEqual([2, 2]);
  });

  it("keeps every flow, including the direct Resume Check close", () => {
    const data = toSankeyData({
      sankeyLinks: [{ source: "RESUME_CHECK", target: "REJECTED", value: 1 }],
      sankeyNodeOrder: [],
    });

    expect(data.nodes.map(n => n.name)).toEqual(["Resume Check", "Rejected"]);
    expect(data.nodes.map(n => n.total)).toEqual([1, 1]);
    expect(data.links).toHaveLength(1);
  });

  it("totals a node across all of its links (in and out)", () => {
    const data = toSankeyData({
      sankeyLinks: [
        { source: "RESUME_CHECK", target: "REJECTED", value: 30 },
        { source: "RESUME_CHECK", target: "INTERVIEW_REQUEST", value: 5 },
        { source: "INTERVIEW_REQUEST", target: "REJECTED", value: 5 },
      ],
      sankeyNodeOrder: [],
    });

    expect(data.nodes.find(n => n.name === "Resume Check")?.total).toBe(35);
    expect(data.nodes.find(n => n.name === "Rejected")?.total).toBe(35);
  });

  // The chart sorts every column by rank, so core's order decides what sits above what.
  it("ranks nodes in core's order, with one core didn't list placed last", () => {
    const data = toSankeyData({
      sankeyLinks: [
        { source: "RESUME_CHECK", target: "REJECTED", value: 3 },
        { source: "RESUME_CHECK", target: "IN_PROGRESS", value: 2 },
        { source: "RESUME_CHECK", target: "SOMETHING_NEW", value: 1 },
      ],
      sankeyNodeOrder: ["RESUME_CHECK", "IN_PROGRESS", "REJECTED"],
    });

    const rankOf = (key: string) => data.nodes.find(n => n.key === key)!.rank;
    expect(rankOf("RESUME_CHECK")).toBe(0);
    expect(rankOf("IN_PROGRESS")).toBeLessThan(rankOf("REJECTED"));
    expect(rankOf("SOMETHING_NEW")).toBe(3);
  });

  it("shows interview round counts by type, with a total, and hides zero-count types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            summary: SUMMARY,
            outcomeCounts: [],
            interviewRoundCounts: [
              { roundNode: "SYSTEM_DESIGN", count: 2, passed: 1, notPassed: 1, passedJobs: [], notPassedJobs: [] },
              { roundNode: "BEHAVIOR", count: 1, passed: 1, notPassed: 0, passedJobs: [], notPassedJobs: [] },
              { roundNode: "VALUES", count: 0, passed: 0, notPassed: 0, passedJobs: [], notPassedJobs: [] },
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

  it("shows how each round type went, so a weak round is visible per type", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            summary: SUMMARY,
            outcomeCounts: [],
            interviewRoundCounts: [
              // Four decided, one lost: the round this job-hunt is strongest at.
              { roundNode: "TECHNICAL_PHONE_SCREEN", count: 5, passed: 3, notPassed: 1, passedJobs: [], notPassedJobs: [] },
              // Three decided, all lost: the weakness the table exists to surface.
              { roundNode: "SYSTEM_DESIGN", count: 3, passed: 0, notPassed: 3, passedJobs: [], notPassedJobs: [] },
            ],
            sankeyLinks: [],
          }),
        ),
      ),
    );

    renderMetricsPage();

    const screenRow = (await screen.findByText("Technical Phone Screen")).closest("tr")!;
    expect(screenRow).toHaveTextContent("75%");
    const designRow = screen.getByText("System Design").closest("tr")!;
    expect(designRow).toHaveTextContent("0%");
  });

  it("leaves the pass rate blank for a type whose rounds are all still undecided", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            summary: SUMMARY,
            outcomeCounts: [],
            // Two rounds sat, neither resolved: 0% would read as two failures.
            interviewRoundCounts: [
              { roundNode: "BEHAVIOR", count: 2, passed: 0, notPassed: 0, passedJobs: [], notPassedJobs: [] },
            ],
            sankeyLinks: [],
          }),
        ),
      ),
    );

    renderMetricsPage();

    const row = (await screen.findByText("Behavior")).closest("tr")!;
    expect(row).toHaveTextContent("—");
    expect(row).not.toHaveTextContent("%");
  });

  it("opens the jobs behind a not-passed number, and closes them again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            summary: SUMMARY,
            outcomeCounts: [],
            interviewRoundCounts: [
              {
                roundNode: "SYSTEM_DESIGN",
                count: 3,
                passed: 1,
                notPassed: 2,
                passedJobs: [{ jobId: 1, company: "Acme Co", role: "SRE", times: 1, components: [] }],
                notPassedJobs: [
                  { jobId: 2, company: "Globex", role: "Engineer", times: 1, components: [] },
                  { jobId: 3, company: "Beta", role: "Backend Engineer", times: 2, components: [] },
                ],
              },
            ],
            sankeyLinks: [],
          }),
        ),
      ),
    );

    renderMetricsPage();

    const notPassed = await screen.findByRole("button", { name: /2 System Design rounds not passed/ });
    expect(screen.queryByText("Globex")).not.toBeInTheDocument();

    fireEvent.click(notPassed);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("System Design — not passed");
    expect(within(dialog).getByText("Globex")).toBeInTheDocument();
    // Faced twice at one job, listed once and said in words.
    expect(within(dialog).getByText("Beta")).toBeInTheDocument();
    expect(dialog).toHaveTextContent("2 times");
    // The passed job belongs to the other number, so it must not show here.
    expect(within(dialog).queryByText("Acme Co")).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("opens the passed list from the other number on the same row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            summary: SUMMARY,
            outcomeCounts: [],
            interviewRoundCounts: [
              {
                roundNode: "SYSTEM_DESIGN",
                count: 2,
                passed: 1,
                notPassed: 1,
                passedJobs: [{ jobId: 1, company: "Acme Co", role: "SRE", times: 1, components: [] }],
                notPassedJobs: [{ jobId: 2, company: "Globex", role: "Engineer", times: 1, components: [] }],
              },
            ],
            sankeyLinks: [],
          }),
        ),
      ),
    );

    renderMetricsPage();

    fireEvent.click(await screen.findByRole("button", { name: /1 System Design rounds not passed/ }));
    expect(within(screen.getByRole("dialog")).getByText("Globex")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: /1 System Design rounds passed/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Acme Co")).toBeInTheDocument();
    expect(within(dialog).queryByText("Globex")).not.toBeInTheDocument();
  });

  it("leaves a zero as plain text, since there is nothing to open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            summary: SUMMARY,
            outcomeCounts: [],
            interviewRoundCounts: [
              { roundNode: "BEHAVIOR", count: 1, passed: 1, notPassed: 0,
                passedJobs: [{ jobId: 1, company: "Acme Co", role: "SRE", times: 1, components: [] }], notPassedJobs: [] },
            ],
            sankeyLinks: [],
          }),
        ),
      ),
    );

    renderMetricsPage();

    await screen.findByText("Behavior");
    expect(screen.queryByRole("button", { name: /not passed/ })).not.toBeInTheDocument();
  });

  it("counts a panel once and shows what each company's panel held", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            summary: SUMMARY,
            outcomeCounts: [],
            // Three panels faced, one converted. The row is the panel, not its interviews.
            interviewRoundCounts: [
              {
                roundNode: "PANEL",
                count: 3,
                passed: 1,
                notPassed: 2,
                passedJobs: [
                  { jobId: 1, company: "Acme Co", role: "SRE", times: 1,
                    components: ["PANEL_CODING", "PANEL_BEHAVIOR"] },
                ],
                notPassedJobs: [
                  { jobId: 2, company: "Globex", role: "Engineer", times: 1,
                    components: ["PANEL_CODING", "PANEL_SYSTEM_DESIGN", "PANEL_BEHAVIOR"] },
                  { jobId: 3, company: "Beta", role: "Backend Engineer", times: 1,
                    components: ["PANEL_CODING", "PANEL_VALUES"] },
                ],
              },
            ],
            sankeyLinks: [],
          }),
        ),
      ),
    );

    renderMetricsPage();

    // One row for panels, with a rate that means something: 1 of 3.
    const row = (await screen.findByText("Panel")).closest("tr")!;
    expect(row).toHaveTextContent("33%");
    // No Unclear column: a rejection after a panel means the panel was not passed, full stop.
    expect(screen.queryByText("Unclear")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /2 Panel rounds not passed/ }));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Panel — not passed");
    const globex = within(dialog).getByText("Globex").closest("li")!;
    expect(globex).toHaveTextContent("Coding");
    expect(globex).toHaveTextContent("System Design");
    expect(globex).toHaveTextContent("Behavior");
    const beta = within(dialog).getByText("Beta").closest("li")!;
    expect(beta).toHaveTextContent("Values");
    expect(beta).not.toHaveTextContent("System Design");
  });

  it("shows a placeholder instead of the interview rounds table when no rounds have been scheduled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          fakeResponse(200, {
            funnel: [{ stage: "RESUME_CHECK", count: 1 }],
            summary: SUMMARY,
            outcomeCounts: [],
            interviewRoundCounts: [{ roundNode: "SYSTEM_DESIGN", count: 0 }],
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
