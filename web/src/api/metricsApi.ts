import type { Stage, Outcome } from "./jobsApi";
import type { InterviewType } from "./interviewsApi";

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
}

export async function getMetrics(): Promise<Metrics> {
  const res = await fetch("/metrics");
  if (!res.ok) {
    throw new Error("failed to load metrics");
  }
  return res.json();
}
