import { describe, expect, it } from "vitest";
import type { SankeyPath } from "../src/api/metricsApi";
import { jobsByLink, journeyThrough } from "../src/sankeyNodes";

const job = (jobId: number, company: string) => ({ jobId, company, role: "Engineer", postings: 1 });

const PATHS: SankeyPath[] = [
  { nodes: ["RESUME_CHECK", "INTERVIEW_REQUEST", "PANEL", "OFFER", "ACCEPTED"], jobs: 1, applications: [job(1, "Initech")] },
  { nodes: ["RESUME_CHECK", "INTERVIEW_REQUEST", "PANEL", "OFFER", "DECLINED"], jobs: 1, applications: [job(2, "Globex")] },
  { nodes: ["RESUME_CHECK", "INTERVIEW_REQUEST", "PANEL", "REJECTED"], jobs: 3,
    applications: [job(3, "Hooli"), job(4, "Hooli"), job(5, "Pied Piper")] },
  { nodes: ["RESUME_CHECK", "REJECTED"], jobs: 1, applications: [job(6, "Acme")] },
];

describe("journeyThrough", () => {
  // Accepted and declined differ only after the offer, so from the panel they are one route of two jobs.
  it("merges routes that only differ past the step after the stage, jobs and all, most jobs first", () => {
    const { routes } = journeyThrough(PATHS, "PANEL");

    expect(routes.map(route => route.nodes.at(-1))).toEqual(["REJECTED", "OFFER"]);
    expect(routes.map(route => route.applications.map(a => a.jobId))).toEqual([[3, 4, 5], [1, 2]]);
    expect(routes.map(route => route.jobs)).toEqual([3, 2]);
  });

  it("lists every job that reached the stage, and no other", () => {
    const journey = journeyThrough(PATHS, "PANEL");

    expect(journey.jobs).toBe(5);
    expect(journey.applications.map(a => a.jobId).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("finds nothing for a stage no job reached", () => {
    const journey = journeyThrough(PATHS, "SYSTEM_DESIGN");

    expect(journey.routes).toEqual([]);
    expect(journey.applications).toEqual([]);
  });
});

describe("jobsByLink", () => {
  it("counts each link's jobs across the routes given", () => {
    expect(Object.fromEntries(jobsByLink(journeyThrough(PATHS, "PANEL").routes))).toEqual({
      "RESUME_CHECK->INTERVIEW_REQUEST": 5,
      "INTERVIEW_REQUEST->PANEL": 5,
      "PANEL->OFFER": 2,
      "PANEL->REJECTED": 3,
    });
  });
});
