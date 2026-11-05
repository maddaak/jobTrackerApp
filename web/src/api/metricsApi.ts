import type { Stage, Outcome } from "./jobsApi";
import type { InterviewType } from "./interviewsApi";
import { request } from "./request";

export interface FunnelStageCount {
  stage: Stage;
  count: number;
}

export interface OutcomeCount {
  outcome: Outcome;
  count: number;
}

export interface RoundJobRef {
  jobId: number;
  company: string;
  role: string;
  // Times this job faced it, so one application never lists twice.
  times: number;
  // What this company's panel held. Empty on rows that are a single interview type.
  components: InterviewType[];
}

export interface InterviewRoundCount {
  // An InterviewType name, or "PANEL" for the aggregate. A panel counts once, not per interview.
  roundNode: string;
  count: number;
  // These two can sum to under count: an open pipeline has judged nothing yet.
  passed: number;
  notPassed: number;
  passedJobs: RoundJobRef[];
  notPassedJobs: RoundJobRef[];
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface MetricsSummary {
  totalJobs: number;
  activeJobs: number;
  // Active and on the board: contacted or interviewing.
  inInterviews: number;
  interviewsDone: number;
  interviewsUpcoming: number;
}

export interface Metrics {
  summary: MetricsSummary;
  funnel: FunnelStageCount[];
  outcomeCounts: OutcomeCount[];
  interviewRoundCounts: InterviewRoundCount[];
  sankeyLinks: SankeyLink[];
  // Top-to-bottom order of the Sankey's nodes within a column, decided by core.
  sankeyNodeOrder: string[];
  // Each distinct route through the Sankey with its jobs and companies, for tracing and listing a stage.
  sankeyPaths?: SankeyPath[];
  // Oldest first, ending with the current week; Monday-start weeks in UTC.
  weeklyActivity: WeeklyActivity[];
  // Only jobs with the resume sent recorded; most replies first.
  resumeResponses: ResumeResponseRate[];
}

// responses: the recruiter reached out, or it went further.
export interface ResumeResponseRate {
  resume: string;
  applications: number;
  responses: number;
}

export interface WeeklyActivity {
  weekStart: string;
  applications: number;
  interviews: number;
}

// One journey: a job, or a chain of reposts linked as replacing each other, named by its newest posting.
export interface SankeyApplication {
  jobId: number;
  company: string;
  role: string;
  postings: number;
}

export interface SankeyPath {
  nodes: string[];
  // Journeys on this route; a chain of reposts is one.
  jobs: number;
  // One entry per journey, so two jobs at one company stay two.
  applications: SankeyApplication[];
}

// One season at a glance. Each count is jobs that got at least that far; dates are null for an empty season.
export interface SeasonStats {
  seasonId: number;
  applications: number;
  active: number;
  heardBack: number;
  interviewed: number;
  offers: number;
  firstApplied: string | null;
  lastApplied: string | null;
}

export async function getSeasonStats(): Promise<SeasonStats[]> {
  return request<SeasonStats[]>("/metrics/seasons", "failed to load season numbers");
}

export async function getMetrics(): Promise<Metrics> {
  return request<Metrics>("/metrics", "failed to load metrics");
}
