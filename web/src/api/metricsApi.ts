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

export interface InterviewRoundCount {
  interviewType: InterviewType;
  count: number;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

export interface Metrics {
  funnel: FunnelStageCount[];
  outcomeCounts: OutcomeCount[];
  interviewRoundCounts: InterviewRoundCount[];
  sankeyLinks: SankeyLink[];
  // Node name -> company name -> job count flowing through it.
  companiesByNode?: Record<string, Record<string, number>>;
}

export async function getMetrics(): Promise<Metrics> {
  return request<Metrics>("/metrics", "failed to load metrics");
}
