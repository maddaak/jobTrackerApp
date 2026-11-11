import { callCore } from "./coreClient.js";
import type { Stage, Outcome } from "./jobsClient.js";
import type { InterviewType } from "./interviewsClient.js";

export interface FunnelStageCountData {
  stage: Stage;
  count: number;
}

export interface OutcomeCountData {
  outcome: Outcome;
  count: number;
}

export interface RoundJobRefData {
  jobId: number;
  company: string;
  role: string;
  times: number;
  components: InterviewType[];
}

export interface InterviewRoundCountData {
  // An InterviewType name, or "PANEL" for the aggregate of every panel type.
  roundNode: string;
  count: number;
  passed: number;
  notPassed: number;
  passedJobs: RoundJobRefData[];
  notPassedJobs: RoundJobRefData[];
}

export interface SankeyLinkData {
  source: string;
  target: string;
  value: number;
}

export interface MetricsSummaryData {
  totalJobs: number;
  activeJobs: number;
  inInterviews: number;
  interviewsDone: number;
  interviewsUpcoming: number;
  acceptedCompany: string | null;
}

export interface MetricsData {
  summary: MetricsSummaryData;
  funnel: FunnelStageCountData[];
  outcomeCounts: OutcomeCountData[];
  interviewRoundCounts: InterviewRoundCountData[];
  sankeyLinks: SankeyLinkData[];
  // Top-to-bottom order of the Sankey's nodes within a column.
  sankeyNodeOrder: string[];
  // Each distinct route through the Sankey, how many journeys took it, and which; a chain of reposts is one.
  sankeyPaths: { nodes: string[]; jobs: number; applications: { jobId: number; company: string; role: string; postings: number }[] }[];
  weeklyActivity: { weekStart: string; applications: number; interviews: number }[];
  resumeResponses: { resume: string; applications: number; responses: number }[];
}

export function getMetrics(userId: string) {
  return callCore<MetricsData>("/metrics", { userId });
}

export interface SeasonStatsData {
  seasonId: number;
  applications: number;
  active: number;
  heardBack: number;
  interviewed: number;
  offers: number;
  firstApplied: string | null;
  lastApplied: string | null;
}

export function getSeasonStats(userId: string) {
  return callCore<SeasonStatsData[]>("/metrics/seasons", { userId });
}

export interface AcceptedOfferData {
  jobId: number;
  company: string;
  role: string;
  applied: string;
  acceptedOn: string | null;
  startsOn: string | null;
  daysToAccept: number | null;
}

// A reposted role counts once, from its first application to its last posting's end.
export interface SeasonSummaryData {
  seasonId: number;
  name: string;
  closedAt: string | null;
  firstApplied: string | null;
  applications: number;
  averageResponseDays: number | null;
  responsesMeasured: number;
  closedApplications: number;
  roundsPassed: number;
  roundsFailed: number;
  rounds: InterviewRoundCountData[];
  acceptedOffer: AcceptedOfferData | null;
  // What closing the season can name as the offer taken.
  offers: { jobId: number; company: string; role: string; accepted: boolean; acceptedOn: string | null;
    startDate: string | null }[];
}

export function getSeasonSummary(userId: string, seasonId: string) {
  return callCore<SeasonSummaryData>(`/metrics/seasons/${encodeURIComponent(seasonId)}/summary`, { userId });
}
