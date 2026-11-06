import type { Metrics, SankeyPath } from "./api/metricsApi";
import { STAGE_LABELS, OUTCOME_LABELS, type Stage, type Outcome } from "./api/jobsApi";
import { INTERVIEW_TYPE_LABELS, type InterviewType } from "./api/interviewsApi";

const SANKEY_NODE_LABELS: Record<string, string> = {
  PANEL: "Panel",
  OFFER: "Offer",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  IN_PROGRESS: "In Progress",
};

export function nodeLabel(name: string): string {
  if (name in STAGE_LABELS) return STAGE_LABELS[name as Stage];
  if (name in SANKEY_NODE_LABELS) return SANKEY_NODE_LABELS[name];
  if (name in INTERVIEW_TYPE_LABELS) return INTERVIEW_TYPE_LABELS[name as InterviewType];
  if (name in OUTCOME_LABELS) return OUTCOME_LABELS[name as Outcome];
  // Title-case an unmapped enum key so it never reaches the user as raw SCREAMING_CASE.
  return name
    .toLowerCase()
    .split("_")
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

// Only RESUME_CHECK and INTERVIEW_REQUEST are ever drawn, and side by side, so they need distinct hues.
const STAGE_COLORS: Record<Stage, string> = {
  RESUME_CHECK: "#0891b2",
  INTERVIEW_REQUEST: "#4f46e5",
  INTERVIEW_STAGE: "#3b82f6",
  WAITING_INTERVIEW_RESULTS: "#6366f1",
  OFFER_STAGE: "#8b5cf6",
  FINALIZED: "#7c3aed",
};

const OUTCOME_COLORS: Record<Outcome, string> = {
  ACTIVE: "#94a3b8",
  OFFER_ACCEPTED: "#22c55e",
  OFFER_DECLINED: "#f59e0b",
  REJECTED: "#ef4444",
  GHOSTED: "#a8a29e",
  WITHDRAWN: "#78716c",
  POSITION_CLOSED: "#b45309",
  PAUSED: "#64748b",
};

// Panel types collapse into one PANEL node. Keyed by the type union, so a new round type without a
// color fails the build instead of drawing in the same grey as In Progress.
type RoundNode = Exclude<InterviewType, `PANEL_${string}`> | "PANEL";

// Distinct color per round so a skipping flow doesn't blend into the round behind it.
const INTERVIEW_ROUND_COLORS: Record<RoundNode, string> = {
  RECRUITER_PHONE_SCREEN: "#e69f00",
  TECHNICAL_PHONE_SCREEN: "#56b4e9",
  HIRING_MANAGER_SCREEN: "#d55e00",
  SYSTEM_DESIGN: "#0072b2",
  DATA_MODELING: "#44aa99",
  PANEL: "#cc79a7",
  TAKE_HOME_ASSIGNMENT: "#009e73",
  TECHNICAL_CODE_REVIEW: "#7f3c8d",
  BEHAVIOR: "#999933",
  CULTURE_FIT: "#6699cc",
  VALUES: "#661100",
  RECRUITER_DEBRIEF: "#882255",
};

const SANKEY_NODE_COLORS: Record<string, string> = {
  OFFER: "#8b5cf6",
  ACCEPTED: "#22c55e",
  DECLINED: "#f59e0b",
  IN_PROGRESS: "#94a3b8",
};

function colorForNode(name: string): string {
  if (name in STAGE_COLORS) return STAGE_COLORS[name as Stage];
  if (name in INTERVIEW_ROUND_COLORS) return INTERVIEW_ROUND_COLORS[name as RoundNode];
  if (name in SANKEY_NODE_COLORS) return SANKEY_NODE_COLORS[name];
  if (name in OUTCOME_COLORS) return OUTCOME_COLORS[name as Outcome];
  return "#94a3b8";
}

// Max of in/out flow so labels match the drawn bars. rank is core's top-to-bottom order; a node it didn't
// list sorts last rather than breaking the layout.
export function toSankeyData(metrics: Pick<Metrics, "sankeyLinks" | "sankeyNodeOrder">) {
  const links = metrics.sankeyLinks;
  const names = Array.from(new Set(links.flatMap(link => [link.source, link.target])));
  const indexOf = new Map(names.map((name, i) => [name, i]));
  const order = metrics.sankeyNodeOrder ?? [];
  const inSum = new Map<string, number>();
  const outSum = new Map<string, number>();
  for (const link of links) {
    outSum.set(link.source, (outSum.get(link.source) ?? 0) + link.value);
    inSum.set(link.target, (inSum.get(link.target) ?? 0) + link.value);
  }
  return {
    nodes: names.map(name => ({
      key: name,
      name: nodeLabel(name),
      total: Math.max(inSum.get(name) ?? 0, outSum.get(name) ?? 0),
      color: colorForNode(name),
      rank: order.includes(name) ? order.indexOf(name) : order.length,
    })),
    links: links.map(link => ({
      source: indexOf.get(link.source)!,
      target: indexOf.get(link.target)!,
      value: link.value,
    })),
  };
}

// The links a set of routes runs along, keyed "a->b", with the jobs on each.
export function jobsByLink(routes: SankeyPath[]) {
  const jobs = new Map<string, number>();
  for (const route of routes) {
    for (let i = 0; i + 1 < route.nodes.length; i++) {
      const key = `${route.nodes[i]}->${route.nodes[i + 1]}`;
      jobs.set(key, (jobs.get(key) ?? 0) + route.jobs);
    }
  }
  return jobs;
}

// How the jobs at a stage got there, and the one step each took next, so it shows which progressed. Further on
// is a different question, so routes that only differ after that step merge into one, their jobs and all.
export function journeyThrough(paths: SankeyPath[], stage: string) {
  const byRoute = new Map<string, SankeyPath>();
  for (const path of paths) {
    const at = path.nodes.indexOf(stage);
    if (at < 0) continue;
    const nodes = path.nodes.slice(0, at + 2);
    const key = nodes.join(">");
    const route = byRoute.get(key) ?? { nodes, jobs: 0, applications: [] };
    route.jobs += path.jobs;
    route.applications.push(...path.applications);
    byRoute.set(key, route);
  }
  const routes = [...byRoute.values()].sort((a, b) => b.jobs - a.jobs);
  const applications = routes.flatMap(route => route.applications);
  return { routes, jobs: applications.length, applications };
}
