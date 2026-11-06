import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SankeyPath } from "../../src/api/metricsApi";
import PipelineSankey from "../../src/components/PipelineSankey";

const KEYS = ["RESUME_CHECK", "INTERVIEW_REQUEST", "PANEL", "OFFER", "IN_PROGRESS", "REJECTED"];
const NODES = KEYS.map((key, rank) => ({ key, name: key, total: 1, color: "#888888", rank }));
const at = (key: string) => KEYS.indexOf(key);

const job = (jobId: number, company: string, role = "Engineer", postings = 1) => ({ jobId, company, role, postings });

// Ten applications: two reach an offer through a panel, three more are rejected after one, five get no reply.
const PATHS: SankeyPath[] = [
  { nodes: ["RESUME_CHECK", "INTERVIEW_REQUEST", "PANEL", "OFFER", "IN_PROGRESS"], jobs: 2,
    applications: [job(1, "Initech", "Backend"), job(2, "Initech", "Frontend")] },
  { nodes: ["RESUME_CHECK", "INTERVIEW_REQUEST", "PANEL", "REJECTED"], jobs: 3,
    applications: [job(3, "Globex"), job(4, "Hooli", "Engineer"), job(5, "Hooli", "Manager")] },
  { nodes: ["RESUME_CHECK", "REJECTED"], jobs: 5, applications: [6, 7, 8, 9, 10].map(id => job(id, "Acme")) },
];
const AT_PANEL = ["Globex", "Hooli (Engineer)", "Hooli (Manager)", "Initech (Backend)", "Initech (Frontend)"];
const LINKS = [
  { source: at("RESUME_CHECK"), target: at("INTERVIEW_REQUEST"), value: 5 },
  { source: at("INTERVIEW_REQUEST"), target: at("PANEL"), value: 5 },
  { source: at("PANEL"), target: at("OFFER"), value: 2 },
  { source: at("OFFER"), target: at("IN_PROGRESS"), value: 2 },
  { source: at("PANEL"), target: at("REJECTED"), value: 3 },
  { source: at("RESUME_CHECK"), target: at("REJECTED"), value: 5 },
];

beforeEach(() => {
  // jsdom lays nothing out, so the chart is handed a width the way the browser would.
  vi.stubGlobal("ResizeObserver", class {
    callback: ResizeObserverCallback;
    constructor(callback: ResizeObserverCallback) {
      this.callback = callback;
    }
    observe() {
      this.callback([{ contentRect: { width: 1400 } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    disconnect() {}
  });
});

function renderChart() {
  return render(<PipelineSankey nodes={NODES} links={LINKS} paths={PATHS} />).container;
}

function tracedLinks(container: HTMLElement) {
  return [...container.querySelectorAll("path[data-traced]")].map(path => path.getAttribute("data-traced"));
}

function stage(key: string) {
  return screen.getByRole("button", { name: `${key}, 1` });
}

function routes(key: string) {
  return within(screen.getByRole("list", { name: `Routes through ${key}` })).getAllByRole("button");
}

function company(label: string) {
  return screen.getByRole("button", { name: label });
}

function companies(key: string) {
  return within(screen.getByRole("list", { name: `Companies at ${key}` })).getAllByRole("listitem").map(item => item.textContent);
}

// Lets the short wait before a stage is let go run out.
function settle() {
  act(() => { vi.advanceTimersByTime(1000); });
}

describe("PipelineSankey", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    return () => vi.useRealTimers();
  });

  // Hovering Offer traces the two jobs that got there back to their applications, plus the step they took next.
  it("traces a hovered stage's jobs back to the start and one step on, and lists them with their companies", () => {
    const container = renderChart();

    fireEvent.mouseEnter(stage("OFFER"));

    expect(tracedLinks(container)).toEqual(["2", "2", "2", "2"]);
    expect(screen.getByText("OFFER · 2 jobs")).toBeInTheDocument();
    expect(routes("OFFER").map(item => item.textContent)).toEqual([
      "2 jobs: RESUME_CHECK → INTERVIEW_REQUEST → PANEL → OFFER → IN_PROGRESS"]);
    // Two jobs at one company say which role each was, or they'd read the same.
    expect(companies("OFFER")).toEqual(["Initech (Backend)", "Initech (Frontend)"]);
  });

  // From the panel, two moved on to an offer and three were rejected; where the offers went after is not lit.
  it("shows which jobs progressed from a stage, and stops after that step", () => {
    const container = renderChart();

    fireEvent.mouseEnter(stage("PANEL"));

    expect(tracedLinks(container)).toEqual(["5", "5", "2", "3"]);
    expect(routes("PANEL").map(item => item.textContent)).toEqual([
      "3 jobs: RESUME_CHECK → INTERVIEW_REQUEST → PANEL → REJECTED",
      "2 jobs: RESUME_CHECK → INTERVIEW_REQUEST → PANEL → OFFER",
    ]);
    expect(companies("PANEL")).toEqual(AT_PANEL);
  });

  it("narrows the chart and the companies to one route while it's hovered in the list", () => {
    const container = renderChart();
    fireEvent.mouseEnter(stage("PANEL"));

    fireEvent.mouseEnter(routes("PANEL")[0]);

    expect(tracedLinks(container)).toEqual(["3", "3", "3"]);
    expect(screen.getByText(/^Companies on this route \(3\)/)).toBeInTheDocument();
    expect(companies("PANEL")).toEqual(["Globex", "Hooli (Engineer)", "Hooli (Manager)"]);

    fireEvent.mouseLeave(routes("PANEL")[0]);
    expect(companies("PANEL")).toEqual(AT_PANEL);
  });

  // The other way round: a company picks out the route it took, while the list stays whole to move along.
  it("picks out a hovered company's route in the list and on the chart", () => {
    const container = renderChart();
    fireEvent.mouseEnter(stage("PANEL"));

    fireEvent.mouseEnter(company("Initech (Backend)"));

    expect(tracedLinks(container)).toEqual(["2", "2", "2"]);
    expect(routes("PANEL")[1]).toHaveAttribute("aria-current", "true");
    expect(routes("PANEL")[0]).not.toHaveAttribute("aria-current");
    expect(companies("PANEL")).toEqual(AT_PANEL);

    fireEvent.mouseLeave(company("Initech (Backend)"));
    expect(tracedLinks(container)).toEqual(["5", "5", "2", "3"]);
  });

  // Clicking a company selects its route, so the route shows its companies with that one marked among them.
  it("holds a clicked company's route and its companies, pinning its stage, and lets go on a second click", () => {
    const container = renderChart();
    fireEvent.mouseEnter(stage("PANEL"));

    fireEvent.click(company("Globex"));
    fireEvent.mouseLeave(company("Globex"));
    fireEvent.mouseLeave(stage("PANEL"));
    settle();

    expect(stage("PANEL")).toHaveAttribute("aria-pressed", "true");
    expect(company("Globex")).toHaveAttribute("aria-pressed", "true");
    expect(routes("PANEL")[0]).toHaveAttribute("aria-pressed", "true");
    expect(companies("PANEL")).toEqual(["Globex", "Hooli (Engineer)", "Hooli (Manager)"]);
    expect(tracedLinks(container)).toEqual(["3", "3", "3"]);

    fireEvent.click(company("Globex"));
    expect(routes("PANEL")[0]).toHaveAttribute("aria-pressed", "false");
    expect(companies("PANEL")).toEqual(AT_PANEL);
    expect(tracedLinks(container)).toEqual(["5", "5", "2", "3"]);
  });

  // The other way round: clicking a route keeps its companies listed after the pointer moves off to read them.
  it("holds a clicked route's companies, and switches when another route or one of its companies is clicked", () => {
    const container = renderChart();
    fireEvent.mouseEnter(stage("PANEL"));

    fireEvent.click(routes("PANEL")[1]);
    fireEvent.mouseLeave(routes("PANEL")[1]);
    fireEvent.mouseLeave(stage("PANEL"));
    settle();

    expect(routes("PANEL")[1]).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/^Companies on this route \(2\)/)).toBeInTheDocument();
    expect(companies("PANEL")).toEqual(["Initech (Backend)", "Initech (Frontend)"]);
    expect(tracedLinks(container)).toEqual(["2", "2", "2"]);

    // Pointing at another route previews it; letting go brings the held one back.
    fireEvent.mouseEnter(routes("PANEL")[0]);
    expect(companies("PANEL")).toEqual(["Globex", "Hooli (Engineer)", "Hooli (Manager)"]);
    fireEvent.mouseLeave(routes("PANEL")[0]);
    expect(companies("PANEL")).toEqual(["Initech (Backend)", "Initech (Frontend)"]);

    fireEvent.click(company("Initech (Frontend)"));
    expect(company("Initech (Frontend)")).toHaveAttribute("aria-pressed", "true");
    expect(routes("PANEL")[1]).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(routes("PANEL")[1]);
    fireEvent.click(routes("PANEL")[1]);
    expect(routes("PANEL")[1]).toHaveAttribute("aria-pressed", "false");
    expect(companies("PANEL")).toEqual(AT_PANEL);
  });

  it("starts a stage pinned again with nothing held", () => {
    renderChart();
    fireEvent.mouseEnter(stage("PANEL"));
    fireEvent.click(routes("PANEL")[1]);
    fireEvent.keyDown(document, { key: "Escape" });

    fireEvent.click(stage("PANEL"));

    expect(routes("PANEL")[1]).toHaveAttribute("aria-pressed", "false");
    expect(companies("PANEL")).toEqual(AT_PANEL);
  });

  it("lights nothing extra until a stage is hovered, and says what hovering does", () => {
    const container = renderChart();

    expect(tracedLinks(container)).toEqual([]);
    expect(screen.getByText(/Point at a stage/)).toBeInTheDocument();
  });

  // Crossing the gap between two stages used to drop the highlight for an instant, flashing the whole chart.
  it("holds the highlight while moving from one stage to the next, and lets go once the pointer leaves", () => {
    const container = renderChart();
    fireEvent.mouseEnter(stage("OFFER"));

    fireEvent.mouseLeave(stage("OFFER"));
    expect(tracedLinks(container)).toEqual(["2", "2", "2", "2"]);
    fireEvent.mouseEnter(stage("PANEL"));
    settle();
    expect(tracedLinks(container)).toEqual(["5", "5", "2", "3"]);

    fireEvent.mouseLeave(stage("PANEL"));
    settle();
    expect(tracedLinks(container)).toEqual([]);
  });

  // Moving down from the chart to read the routes or companies must not lose the stage on the way.
  it("keeps a hovered stage while the pointer is in its details", () => {
    renderChart();
    fireEvent.mouseEnter(stage("OFFER"));
    const details = screen.getByText("OFFER · 2 jobs").closest("div.flex-col")!;

    fireEvent.mouseLeave(stage("OFFER"));
    fireEvent.mouseEnter(details);
    settle();
    expect(screen.getByText("OFFER · 2 jobs")).toBeInTheDocument();

    fireEvent.mouseLeave(details);
    settle();
    expect(screen.getByText(/Point at a stage/)).toBeInTheDocument();
  });

  it("keeps a clicked stage after the pointer leaves, previews another over it, and lets go on a second click", () => {
    renderChart();
    fireEvent.mouseEnter(stage("OFFER"));
    fireEvent.click(stage("OFFER"));
    fireEvent.mouseLeave(stage("OFFER"));
    settle();

    expect(screen.getByText("OFFER · 2 jobs")).toBeInTheDocument();
    expect(stage("OFFER")).toHaveAttribute("aria-pressed", "true");

    fireEvent.mouseEnter(stage("PANEL"));
    expect(screen.getByText("PANEL · 5 jobs")).toBeInTheDocument();
    expect(screen.getByText("Previewing; OFFER is pinned")).toBeInTheDocument();
    fireEvent.mouseLeave(stage("PANEL"));
    settle();
    expect(screen.getByText("OFFER · 2 jobs")).toBeInTheDocument();

    fireEvent.click(stage("OFFER"));
    settle();
    expect(screen.getByText(/Point at a stage/)).toBeInTheDocument();
  });

  it("pins from the keyboard, and lets go on Escape or the unpin button", () => {
    renderChart();

    fireEvent.keyDown(stage("PANEL"), { key: "Enter" });
    expect(screen.getByText("PANEL · 5 jobs")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByText(/Point at a stage/)).toBeInTheDocument();

    fireEvent.click(stage("PANEL"));
    fireEvent.click(screen.getByRole("button", { name: "Unpin PANEL" }));
    expect(screen.getByText(/Point at a stage/)).toBeInTheDocument();
  });

  it("names a chain of reposts once, by how many postings it took", () => {
    const reposted: SankeyPath[] = [{ nodes: ["RESUME_CHECK", "INTERVIEW_REQUEST", "PANEL", "OFFER", "IN_PROGRESS"], jobs: 1,
      applications: [job(14, "Initech", "Senior Engineer", 3)] }];
    render(<PipelineSankey nodes={NODES} links={LINKS} paths={reposted} />);

    fireEvent.mouseEnter(stage("OFFER"));

    expect(company("Initech (3 postings)")).toHaveAttribute("title", "Senior Engineer, the newest of 3 linked postings");
  });

  // A wrapped route would grow the list past its fixed space and move the page, so each stays one line.
  it("keeps each route on one line, with the whole route on hover", () => {
    renderChart();

    fireEvent.mouseEnter(stage("OFFER"));

    const [route] = routes("OFFER");
    expect(route).toHaveClass("truncate");
    expect(route).toHaveAttribute("title", "RESUME_CHECK → INTERVIEW_REQUEST → PANEL → OFFER → IN_PROGRESS");
  });

  // Only the commonest routes are listed, but a company's can rank below them; its row must still show it held.
  it("lists a held company's route even when it ranks below the routes listed", () => {
    const manyRoutes: SankeyPath[] = Array.from({ length: 8 }, (_, i) => (
      { nodes: ["RESUME_CHECK", `STEP_${i}`], jobs: 8 - i, applications: [job(100 + i, `Co ${i}`)] }
    ));
    render(<PipelineSankey nodes={NODES} links={LINKS} paths={manyRoutes} />);
    fireEvent.mouseEnter(stage("RESUME_CHECK"));
    expect(routes("RESUME_CHECK")).toHaveLength(6);

    fireEvent.click(company("Co 7"));

    const held = routes("RESUME_CHECK").find(route => route.getAttribute("aria-pressed") === "true");
    expect(held).toHaveAttribute("title", "RESUME_CHECK → STEP_7");
    expect(screen.getByText("and 1 more routes")).toBeInTheDocument();
  });
});
