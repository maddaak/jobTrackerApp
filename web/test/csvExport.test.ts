import { describe, expect, it } from "vitest";
import { toCsv } from "../src/csvExport";
import { guessField, parseCsv, toImportRows } from "../src/csvImport";
import type { JobSummary, Outcome, Stage } from "../src/api/jobsApi";

function job(id: number, currentStage: Stage, outcome: Outcome, extra: Partial<JobSummary> = {}): JobSummary {
  return {
    id, company: `Company ${id}`, role: "Engineer", sourceCategory: "SELF_APPLIED", currentStage, interviewPhase: null,
    boardPhase: null, outcome, url: null, location: null, city: null, compMin: null, compMax: null,
    createdAt: "2026-03-09T15:00:00Z", latestInterview: null, needsScheduling: false, links: [], seasonId: 1, ...extra,
  };
}

function reimport(jobs: JobSummary[]) {
  const table = parseCsv(toCsv(jobs));
  return toImportRows(table, table[0].map(guessField)).rows;
}

describe("toCsv", () => {
  // The export is only useful if it comes back as it left: every column is one the importer recognises.
  it("re-imports with every field and the same place in the pipeline", () => {
    const [row] = reimport([job(1, "INTERVIEW_STAGE", "ACTIVE", {
      company: "Acme, Inc.", role: 'The "Principal" Engineer', location: "HYBRID", city: "Austin, TX",
      compMin: 150000, compMax: 190000, sourceCategory: "REFERRAL_APPLIED", url: "https://example.com/jobs/1",
    })]);

    expect(row).toEqual({
      company: "Acme, Inc.", role: 'The "Principal" Engineer', sourceCategory: "REFERRAL_APPLIED",
      url: "https://example.com/jobs/1", location: "HYBRID", city: "Austin, TX", compMin: 150000, compMax: 190000,
      notes: undefined, stage: "INTERVIEW_STAGE", outcome: undefined, appliedOn: "2026-03-09", rejectedReason: undefined,
    });
  });

  it("keeps every stage and outcome through a round trip", () => {
    const cases: [JobSummary, Stage | undefined, Outcome | undefined][] = [
      [job(1, "RESUME_CHECK", "ACTIVE"), undefined, undefined],
      [job(2, "INTERVIEW_REQUEST", "PAUSED"), "INTERVIEW_REQUEST", "PAUSED"],
      [job(9, "INTERVIEW_STAGE", "ACTIVE"), "INTERVIEW_STAGE", undefined],
      [job(10, "WAITING_INTERVIEW_RESULTS", "ACTIVE"), "WAITING_INTERVIEW_RESULTS", undefined],
      [job(3, "OFFER_STAGE", "OFFER_ACCEPTED"), "OFFER_STAGE", "OFFER_ACCEPTED"],
      [job(4, "OFFER_STAGE", "OFFER_DECLINED"), "OFFER_STAGE", "OFFER_DECLINED"],
      [job(5, "FINALIZED", "GHOSTED"), undefined, "GHOSTED"],
      [job(6, "FINALIZED", "WITHDRAWN"), undefined, "WITHDRAWN"],
      [job(7, "FINALIZED", "POSITION_CLOSED"), undefined, "POSITION_CLOSED"],
      [job(8, "FINALIZED", "REJECTED", {
        latestInterview: { roundId: "r", interviewDateTime: "2026-03-20T15:00:00Z", interviewEndDateTime: null,
          interviewType: "SYSTEM_DESIGN", roundCount: 1, meetingLink: null, location: null, interviewers: [] },
      }), "INTERVIEW_STAGE", "REJECTED"],
    ];

    const rows = reimport(cases.map(([summary]) => summary));

    cases.forEach(([summary, stage, outcome], i) => {
      expect([rows[i].stage, rows[i].outcome], `${summary.currentStage} ${summary.outcome}`).toEqual([stage, outcome]);
    });
  });

  // Text from a scraped posting must not run as a formula when the file is opened.
  it("defuses a cell that a spreadsheet would read as a formula", () => {
    const csv = toCsv([job(1, "RESUME_CHECK", "ACTIVE", { company: "=HYPERLINK(\"x\")" })]);

    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
