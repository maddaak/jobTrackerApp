import {
  CLOSED_OUTCOMES,
  INTERVIEW_PHASE_LABELS,
  toUpdateJobInput,
  type InterviewPhase,
  type JobSummary,
  type UpdateJobInput,
} from "./api/jobsApi";

// Where a job lives in the app: which board column, which list page, and how to move it. The one
// place these rules are written, so a count in the nav and the page it links to can never disagree.

export type BoardColumnId = "CONTACTED" | InterviewPhase;

export const BOARD_COLUMNS: { id: BoardColumnId; label: string }[] = [
  { id: "CONTACTED", label: "Interview Request" },
  { id: "INITIAL_SCREEN", label: INTERVIEW_PHASE_LABELS.INITIAL_SCREEN },
  { id: "MID_ROUNDS", label: INTERVIEW_PHASE_LABELS.MID_ROUNDS },
  { id: "PANEL", label: INTERVIEW_PHASE_LABELS.PANEL },
];

// The board's columns plus the pages either side of it, so one picker can move a job anywhere open.
export type PipelinePlace = "SUBMITTED" | BoardColumnId | "OFFER";

export const PIPELINE_PLACES: { id: PipelinePlace; label: string }[] = [
  { id: "SUBMITTED", label: "Submitted" },
  ...BOARD_COLUMNS,
  { id: "OFFER", label: "Offer" },
];

export function isInterviewing(job: JobSummary): boolean {
  return job.currentStage === "INTERVIEW_STAGE" || job.currentStage === "WAITING_INTERVIEW_RESULTS";
}

export const isSubmitted = (job: JobSummary) => job.outcome === "ACTIVE" && job.currentStage === "RESUME_CHECK";
export const isPendingOffer = (job: JobSummary) => job.outcome === "ACTIVE" && job.currentStage === "OFFER_STAGE";
export const isPaused = (job: JobSummary) => job.outcome === "PAUSED";
export const isClosed = (job: JobSummary) => CLOSED_OUTCOMES.includes(job.outcome);
// Open or paused: a stage still means something. Closed and decided jobs are done with the pipeline.
export const hasStage = (job: JobSummary) => job.outcome === "ACTIVE" || job.outcome === "PAUSED";

// Where the job sits whatever its outcome, so a paused job knows where it will resume. Null once finalized.
export function pipelinePlaceOf(job: JobSummary): PipelinePlace | null {
  if (isInterviewing(job)) {
    // Interviewing with no rounds and no drag yet: it has at least reached a first screen.
    return job.boardPhase ?? "INITIAL_SCREEN";
  }
  switch (job.currentStage) {
    case "RESUME_CHECK":
      return "SUBMITTED";
    case "INTERVIEW_REQUEST":
      return "CONTACTED";
    case "OFFER_STAGE":
      return "OFFER";
    default:
      return null;
  }
}

// Null means the job belongs on another page: Submitted, Offers, Paused, or Closed.
export function boardColumnOf(job: JobSummary): BoardColumnId | null {
  if (job.outcome !== "ACTIVE") return null;
  const place = pipelinePlaceOf(job);
  return place === "SUBMITTED" || place === "OFFER" ? null : place;
}

export function moveToPlace(job: JobSummary, place: PipelinePlace): UpdateJobInput {
  if (place === "SUBMITTED") return { ...toUpdateJobInput(job), currentStage: "RESUME_CHECK" };
  if (place === "OFFER") return { ...toUpdateJobInput(job), currentStage: "OFFER_STAGE" };
  return moveToColumn(job, place);
}

export type BoardDropTarget = BoardColumnId | "SUBMITTED" | "OFFER_ZONE" | "PAUSE_ZONE" | "CLOSE_ZONE";

// What dropping a card asks for: an update to save, "close" for the dialog that asks which closed
// outcome, or null when it was dropped back where it already was.
export function boardDrop(job: JobSummary, target: BoardDropTarget): UpdateJobInput | "close" | null {
  if (target === boardColumnOf(job) || (target === "SUBMITTED" && isSubmitted(job))) return null;
  if (target === "SUBMITTED") return moveToPlace(job, "SUBMITTED");
  if (target === "CLOSE_ZONE") return "close";
  if (target === "OFFER_ZONE") return moveToPlace(job, "OFFER");
  if (target === "PAUSE_ZONE") return { ...toUpdateJobInput(job), outcome: "PAUSED" };
  return moveToColumn(job, target);
}

// Moving between interview columns keeps Waiting Results, so a drag never silently clears it.
export function moveToColumn(job: JobSummary, column: BoardColumnId): UpdateJobInput {
  const input = toUpdateJobInput(job);
  if (column === "CONTACTED") {
    return { ...input, currentStage: "INTERVIEW_REQUEST" };
  }
  return { ...input, currentStage: isInterviewing(job) ? job.currentStage : "INTERVIEW_STAGE", interviewPhase: column };
}
