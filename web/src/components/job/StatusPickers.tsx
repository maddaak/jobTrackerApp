import { PIPELINE_PLACES, isInterviewing, moveToPlace, pipelinePlaceOf, type PipelinePlace } from "../../jobPlacement";
import {
  INTERVIEW_PHASE_LABELS,
  OUTCOMES,
  OUTCOME_LABELS,
  toUpdateJobInput,
  type JobSummary,
  type Outcome,
  type UpdateJobInput,
} from "../../api/jobsApi";

// The one set of status controls, used by the job dialog and the table alike, so moving a job means the
// same thing wherever it's done. Each hands back the whole update; the caller decides how to save it.
interface PickerProps {
  job: JobSummary;
  disabled: boolean;
  className: string;
  onChange: (input: UpdateJobInput) => void;
}

// core moves a closed outcome to Finalized itself, and a reopened one back to where it stood.
export function StatusSelect({ job, disabled, className, onChange }: PickerProps) {
  return (
    <select
      aria-label="Status"
      disabled={disabled}
      value={job.outcome}
      onChange={e => onChange({ ...toUpdateJobInput(job), outcome: e.target.value as Outcome })}
      className={className}
    >
      {OUTCOMES.map(outcome => (
        <option key={outcome} value={outcome}>{OUTCOME_LABELS[outcome]}</option>
      ))}
    </select>
  );
}

// The interview columns sit under one heading, since together they are what "Interview Stage" was.
const INTERVIEWING = PIPELINE_PLACES.filter(place => place.id in INTERVIEW_PHASE_LABELS);
const FIRST_INTERVIEWING = PIPELINE_PLACES.indexOf(INTERVIEWING[0]);
const BEFORE_INTERVIEWING = PIPELINE_PLACES.slice(0, FIRST_INTERVIEWING);
const AFTER_INTERVIEWING = PIPELINE_PLACES.slice(FIRST_INTERVIEWING + INTERVIEWING.length);

function placeOption(place: { id: PipelinePlace; label: string }) {
  return <option key={place.id} value={place.id}>{place.label}</option>;
}

// Board terms, not raw stages: a closed job has no place, so this is shown only for open or paused jobs.
export function StageSelect({ job, disabled, className, onChange }: PickerProps) {
  const place = pipelinePlaceOf(job);
  return (
    <select
      aria-label="Stage"
      disabled={disabled}
      value={place ?? ""}
      onChange={e => onChange(moveToPlace(job, e.target.value as PipelinePlace))}
      className={className}
    >
      {/* A job reopened from Finalized has no stage to show until one is picked. */}
      {place === null && <option value="" disabled>Choose a stage</option>}
      {BEFORE_INTERVIEWING.map(placeOption)}
      <optgroup label="Interviewing">{INTERVIEWING.map(placeOption)}</optgroup>
      {AFTER_INTERVIEWING.map(placeOption)}
    </select>
  );
}

// Only while interviewing: waiting on results is a pause within a round, not a place of its own.
export function WaitingOnResults({ job, disabled, className, onChange }: PickerProps) {
  if (!isInterviewing(job)) return null;
  return (
    <label className={className}>
      <input
        type="checkbox"
        disabled={disabled}
        checked={job.currentStage === "WAITING_INTERVIEW_RESULTS"}
        onChange={e => onChange({
          ...toUpdateJobInput(job),
          currentStage: e.target.checked ? "WAITING_INTERVIEW_RESULTS" : "INTERVIEW_STAGE",
        })}
      />
      Waiting on results
    </label>
  );
}
