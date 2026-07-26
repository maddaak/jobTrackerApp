import { callCore, type ErrorResponseData } from "./coreClient.js";
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

export interface InterviewRoundCountData {
  interviewType: InterviewType;
  count: number;
}

export interface SankeyLinkData {
  source: string;
  target: string;
  value: number;
}

export interface MetricsData {
  funnel: FunnelStageCountData[];
  outcomeCounts: OutcomeCountData[];
  interviewRoundCounts: InterviewRoundCountData[];
  sankeyLinks: SankeyLinkData[];
}

export function getMetrics(userId: string) {
  return callCore<MetricsData & Partial<ErrorResponseData>>("/metrics", { userId });
}
