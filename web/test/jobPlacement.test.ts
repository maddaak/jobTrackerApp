import { describe, it, expect } from "vitest";
import {
  boardColumnOf,
  boardDrop,
  isClosed,
  isPaused,
  isPendingOffer,
  isSubmitted,
  moveToColumn,
  moveToPlace,
  pipelinePlaceOf,
  BOARD_COLUMNS,
  PIPELINE_PLACES,
} from "../src/jobPlacement";
import {
  INTERVIEW_PHASES,
  OUTCOMES,
  STAGE_ORDER,
  type JobSummary,
  type Stage,
  type UpdateJobInput,
} from "../src/api/jobsApi";

function job(overrides: Partial<JobSummary>): JobSummary {
  return {
    id: 1, company: "Acme", role: "Engineer", sourceCategory: "SELF_APPLIED", currentStage: "RESUME_CHECK",
    interviewPhase: null, boardPhase: null, outcome: "ACTIVE", url: null, location: null, compMin: null,
    compMax: null, createdAt: "2026-01-01T00:00:00Z", latestInterview: null, needsScheduling: false, links: [],
    city: null, seasonId: 1, ...overrides,
  };
}

// What the job looks like once core has saved a move: a stored phase is also where the card sits.
function saved(before: JobSummary, input: UpdateJobInput): JobSummary {
  return { ...before, ...input, boardPhase: input.interviewPhase ?? before.boardPhase };
}

const INTERVIEWING: Stage[] = ["INTERVIEW_STAGE", "WAITING_INTERVIEW_RESULTS"];

describe("boardColumnOf", () => {
  it("keeps every job that is not active off the board, whatever its stage", () => {
    for (const outcome of OUTCOMES.filter(o => o !== "ACTIVE")) {
      for (const stage of STAGE_ORDER) {
        expect(boardColumnOf(job({ outcome, currentStage: stage })), `${outcome}/${stage}`).toBeNull();
      }
    }
  });

  it("places only contacted and interviewing stages on the board", () => {
    for (const stage of STAGE_ORDER) {
      const column = boardColumnOf(job({ currentStage: stage }));
      if (stage === "INTERVIEW_REQUEST") expect(column).toBe("CONTACTED");
      else if (INTERVIEWING.includes(stage)) expect(column).not.toBeNull();
      else expect(column, stage).toBeNull();
    }
  });

  it("puts an interviewing job in its board phase's column, for both interviewing stages", () => {
    for (const stage of INTERVIEWING) {
      for (const phase of INTERVIEW_PHASES) {
        expect(boardColumnOf(job({ currentStage: stage, boardPhase: phase }))).toBe(phase);
      }
    }
  });

  it("starts an interviewing job with no phase in Initial Screen", () => {
    expect(boardColumnOf(job({ currentStage: "INTERVIEW_STAGE" }))).toBe("INITIAL_SCREEN");
  });
});

describe("boardDrop", () => {
  // A card in every column, dropped on every target: what each drop asks for.
  const starts = BOARD_COLUMNS.map(column => saved(job({ currentStage: "INTERVIEW_REQUEST" }), moveToColumn(job({}), column.id)));

  it("moves a submitted job onto any column, and a board card back to Submitted", () => {
    const applied = job({});
    expect(boardDrop(applied, "SUBMITTED")).toBeNull();
    for (const column of BOARD_COLUMNS) {
      expect(boardColumnOf(saved(applied, boardDrop(applied, column.id) as UpdateJobInput))).toBe(column.id);
    }
    for (const start of starts) {
      expect(isSubmitted(saved(start, boardDrop(start, "SUBMITTED") as UpdateJobInput))).toBe(true);
    }
  });

  it("does nothing for a card dropped back on its own column", () => {
    for (const start of starts) {
      expect(boardDrop(start, boardColumnOf(start)!)).toBeNull();
    }
  });

  it("moves a card to another column, or off the board through an exit", () => {
    for (const start of starts) {
      for (const column of BOARD_COLUMNS.filter(c => c.id !== boardColumnOf(start))) {
        const moved = saved(start, boardDrop(start, column.id) as UpdateJobInput);
        expect(boardColumnOf(moved), `${boardColumnOf(start)} to ${column.id}`).toBe(column.id);
      }
      expect(boardDrop(start, "CLOSE_ZONE")).toBe("close");
      expect(isPendingOffer(saved(start, boardDrop(start, "OFFER_ZONE") as UpdateJobInput))).toBe(true);
      // Paused keeps its stage, so resuming puts it back in the same column.
      const paused = saved(start, boardDrop(start, "PAUSE_ZONE") as UpdateJobInput);
      expect(isPaused(paused)).toBe(true);
      expect(pipelinePlaceOf(paused)).toBe(boardColumnOf(start));
    }
  });
});

describe("the list pages", () => {
  // Every stage under every outcome, so the nav's counts and the pages agree on each job.
  it("puts every job on exactly one of the board, its lists, or nowhere once finalized and active", () => {
    for (const outcome of OUTCOMES) {
      for (const stage of STAGE_ORDER) {
        const candidate = job({ outcome, currentStage: stage });
        const homes = [boardColumnOf(candidate) !== null, isSubmitted(candidate), isPendingOffer(candidate),
          isPaused(candidate), isClosed(candidate)].filter(Boolean).length;
        const decidedOffer = outcome === "OFFER_ACCEPTED" || outcome === "OFFER_DECLINED";
        expect(homes, `${outcome}/${stage}`).toBe(decidedOffer || (outcome === "ACTIVE" && stage === "FINALIZED") ? 0 : 1);
      }
    }
  });
});

describe("pipelinePlaceOf and moveToPlace", () => {
  it("round-trips every place, so the card's picker always shows where a move just put the job", () => {
    for (const place of PIPELINE_PLACES) {
      const start = job({});
      expect(pipelinePlaceOf(saved(start, moveToPlace(start, place.id))), place.id).toBe(place.id);
    }
  });

  it("keeps a paused job's place, so resuming it puts it back where it was", () => {
    const paused = job({ outcome: "PAUSED", currentStage: "WAITING_INTERVIEW_RESULTS", boardPhase: "PANEL" });

    expect(boardColumnOf(paused)).toBeNull();
    expect(pipelinePlaceOf(paused)).toBe("PANEL");
    expect(boardColumnOf({ ...paused, outcome: "ACTIVE" })).toBe("PANEL");
  });
});

describe("moveToColumn", () => {
  it("lands a card in the column it was dropped on, from every column", () => {
    for (const from of BOARD_COLUMNS) {
      const start = from.id === "CONTACTED"
        ? job({ currentStage: "INTERVIEW_REQUEST" })
        : job({ currentStage: "INTERVIEW_STAGE", interviewPhase: from.id, boardPhase: from.id });
      for (const to of BOARD_COLUMNS) {
        expect(boardColumnOf(saved(start, moveToColumn(start, to.id))), `${from.id} -> ${to.id}`).toBe(to.id);
      }
    }
  });

  it("keeps Waiting on results when a card moves between interview columns", () => {
    const waiting = job({ currentStage: "WAITING_INTERVIEW_RESULTS", interviewPhase: "MID_ROUNDS", boardPhase: "MID_ROUNDS" });

    expect(moveToColumn(waiting, "PANEL")).toMatchObject({
      currentStage: "WAITING_INTERVIEW_RESULTS",
      interviewPhase: "PANEL",
    });
  });

  it("sends back the stored phase, never the one only shown, so a later round can still move the card", () => {
    const undragged = job({ currentStage: "INTERVIEW_STAGE", interviewPhase: null, boardPhase: "MID_ROUNDS" });

    expect(moveToPlace(undragged, "MID_ROUNDS").interviewPhase).toBe("MID_ROUNDS");
    expect(moveToPlace(undragged, "CONTACTED").interviewPhase).toBeNull();
  });

  it("sends the rest of the job back unchanged, since the PATCH replaces the whole record", () => {
    const contacted = job({ currentStage: "INTERVIEW_REQUEST", compMin: 100, url: "https://acme.example/jobs/1" });

    expect(moveToColumn(contacted, "MID_ROUNDS")).toMatchObject({
      company: "Acme", compMin: 100, url: "https://acme.example/jobs/1", outcome: "ACTIVE",
    });
  });
});
