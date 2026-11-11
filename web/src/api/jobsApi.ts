import type { JobAiResults } from "./aiApi";
import type { InterviewType, Interviewer } from "./interviewsApi";
import { request } from "./request";

export type SourceCategory =
  | "SELF_APPLIED"
  | "REFERRAL_APPLIED"
  | "LINKEDIN_OUTREACH"
  | "EMAIL_OUTREACH";

export type Stage =
  | "RESUME_CHECK"
  | "INTERVIEW_REQUEST"
  | "INTERVIEW_STAGE"
  | "WAITING_INTERVIEW_RESULTS"
  | "OFFER_STAGE"
  | "FINALIZED";

// Where an interviewing job sits on the board; refines INTERVIEW_STAGE and WAITING_INTERVIEW_RESULTS.
export type InterviewPhase = "INITIAL_SCREEN" | "MID_ROUNDS" | "PANEL";

export const INTERVIEW_PHASES: InterviewPhase[] = ["INITIAL_SCREEN", "MID_ROUNDS", "PANEL"];

export const INTERVIEW_PHASE_LABELS: Record<InterviewPhase, string> = {
  INITIAL_SCREEN: "Initial Screen",
  MID_ROUNDS: "Mid Rounds",
  PANEL: "Panel",
};

export type Outcome =
  | "ACTIVE"
  | "OFFER_ACCEPTED"
  | "OFFER_DECLINED"
  | "REJECTED"
  | "GHOSTED"
  | "WITHDRAWN"
  | "POSITION_CLOSED"
  | "PAUSED";

export type JobRelation = "REPLACED_BY" | "REPLACES" | "RELATED";

// The work model; where the office is goes in city.
export type Location = "REMOTE" | "ON_SITE" | "HYBRID";

export const SOURCE_CATEGORIES: SourceCategory[] = [
  "SELF_APPLIED",
  "REFERRAL_APPLIED",
  "LINKEDIN_OUTREACH",
  "EMAIL_OUTREACH",
];

export const SOURCE_CATEGORY_LABELS: Record<SourceCategory, string> = {
  SELF_APPLIED: "Self Applied",
  REFERRAL_APPLIED: "Referral Applied",
  LINKEDIN_OUTREACH: "LinkedIn Outreach",
  EMAIL_OUTREACH: "Email Outreach",
};

export const LOCATIONS: { value: Location; label: string }[] = [
  { value: "REMOTE", label: "Remote" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "ON_SITE", label: "On-site" },
];

export const STAGE_ORDER: Stage[] = [
  "RESUME_CHECK",
  "INTERVIEW_REQUEST",
  "INTERVIEW_STAGE",
  "WAITING_INTERVIEW_RESULTS",
  "OFFER_STAGE",
  "FINALIZED",
];

export const OUTCOMES: Outcome[] = [
  "ACTIVE",
  "OFFER_ACCEPTED",
  "OFFER_DECLINED",
  "REJECTED",
  "GHOSTED",
  "WITHDRAWN",
  "POSITION_CLOSED",
  "PAUSED",
];

// Mirrors Outcome.closesPipeline(); core is what enforces it.
export const CLOSED_OUTCOMES: Outcome[] = ["REJECTED", "GHOSTED", "WITHDRAWN", "POSITION_CLOSED"];

// Phrased from the row you're on, so each end of a link reads correctly.
export const JOB_RELATION_LABELS: Record<JobRelation, string> = {
  REPLACED_BY: "replaced by",
  REPLACES: "replaces",
  RELATED: "related to",
};

export const JOB_RELATIONS: JobRelation[] = ["REPLACED_BY", "REPLACES", "RELATED"];

export const STAGE_LABELS: Record<Stage, string> = {
  RESUME_CHECK: "Resume Check",
  INTERVIEW_REQUEST: "Interview Request",
  INTERVIEW_STAGE: "Interview Stage",
  WAITING_INTERVIEW_RESULTS: "Waiting Interview Results",
  OFFER_STAGE: "Offer Stage",
  FINALIZED: "Finalized",
};

export const OUTCOME_LABELS: Record<Outcome, string> = {
  ACTIVE: "Active",
  OFFER_ACCEPTED: "Offer Accepted",
  OFFER_DECLINED: "Offer Declined",
  REJECTED: "Rejected",
  GHOSTED: "Ghosted",
  WITHDRAWN: "Withdrawn",
  POSITION_CLOSED: "Position Closed",
  PAUSED: "Paused",
};

export interface LatestInterviewSummary {
  roundId: string;
  interviewDateTime: string;
  interviewEndDateTime: string | null;
  interviewType: InterviewType | null;
  roundCount: number;
  meetingLink: string | null;
  location: string | null;
  interviewers: Interviewer[];
}

export interface JobLink {
  jobId: number;
  company: string;
  role: string;
  relation: JobRelation;
}

export interface JobSummary {
  id: number;
  company: string;
  role: string;
  sourceCategory: SourceCategory;
  currentStage: Stage;
  // Stored, null until the card is dragged: what a PATCH sends back, so an edit never freezes a guess.
  interviewPhase: InterviewPhase | null;
  // Where the card sits: the drag if any, else the furthest round logged. Display only, never sent back.
  boardPhase: InterviewPhase | null;
  outcome: Outcome;
  url: string | null;
  location: Location | null;
  city: string | null;
  compMin: number | null;
  compMax: number | null;
  createdAt: string;
  latestInterview: LatestInterviewSummary | null;
  // Interviewing with nothing booked ahead; core decides, so the badge and the reminder digest agree.
  needsScheduling: boolean;
  links: JobLink[];
  seasonId: number;
}

export interface CreateJobInput {
  company: string;
  role: string;
  sourceCategory: SourceCategory;
  url?: string;
  location?: Location;
  city?: string;
  compMin?: number;
  compMax?: number;
  notes?: string;
  // Omitted means applied and waiting; a recruiter reaching out first puts the job straight on the board.
  startingStage?: "RESUME_CHECK" | "INTERVIEW_REQUEST";
  // Sent with the create, so a new job is one request rather than a create plus follow-up saves.
  jdText?: string;
  recommendedResume?: string;
}

// A spreadsheet row matched to fields. Core dates it, places it, and skips one already tracked.
export interface ImportJobRow {
  company: string;
  role: string;
  sourceCategory?: SourceCategory;
  url?: string;
  location?: Location;
  city?: string;
  compMin?: number;
  compMax?: number;
  notes?: string;
  stage?: Exclude<Stage, "FINALIZED">;
  outcome?: Outcome;
  // yyyy-mm-dd
  appliedOn?: string;
  rejectedReason?: string;
}

export async function importJobs(jobs: ImportJobRow[]): Promise<{ imported: number; skipped: number }> {
  return request("/jobs/import", "failed to import the spreadsheet", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobs }),
  });
}

export async function listJobs(): Promise<JobSummary[]> {
  return request<JobSummary[]>("/jobs", "failed to load jobs");
}

// Core answers a create with the stored row only; the board fields arrive with the next list load.
export type CreatedJob = Omit<JobSummary, "interviewPhase" | "boardPhase" | "latestInterview" | "links">;

export async function createJob(input: CreateJobInput): Promise<CreatedJob> {
  return request<CreatedJob>("/jobs", "failed to create job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export interface UpdateJobInput {
  company: string;
  role: string;
  sourceCategory: SourceCategory;
  url: string | null;
  location: Location | null;
  city: string | null;
  compMin: number | null;
  compMax: number | null;
  currentStage: Stage;
  interviewPhase: InterviewPhase | null;
  outcome: Outcome;
}

export function toUpdateJobInput(job: JobSummary): UpdateJobInput {
  return {
    company: job.company,
    role: job.role,
    sourceCategory: job.sourceCategory,
    url: job.url,
    location: job.location,
    city: job.city,
    compMin: job.compMin,
    compMax: job.compMax,
    currentStage: job.currentStage,
    // The stored phase, not boardPhase: PATCH replaces, so this keeps a drag without storing a guess.
    interviewPhase: job.interviewPhase,
    outcome: job.outcome,
  };
}

export async function updateJob(id: number, input: UpdateJobInput): Promise<JobSummary> {
  return request<JobSummary>(`/jobs/${id}`, "failed to update job", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function deleteJob(id: number): Promise<void> {
  await request<unknown>(`/jobs/${id}`, "failed to delete job", { method: "DELETE" });
}

export interface StageHistoryEntry {
  stage: Stage;
  enteredAt: string;
  note: string | null;
}

export async function getJobStages(id: number): Promise<StageHistoryEntry[]> {
  const data = await request<{ stageEvents?: StageHistoryEntry[] }>(`/jobs/${id}`, "failed to load job history");
  // request casts without validating; undefined here crashes the modal on .filter a render later.
  if (!Array.isArray(data.stageEvents)) {
    throw new Error("failed to load job history");
  }
  return data.stageEvents;
}

// Also rewinds the job's stage, so the table's dropdown follows.
export async function deleteJobStage(id: number, enteredAt: string, stage: Stage): Promise<StageHistoryEntry[]> {
  const data = await request<StageHistoryEntry[]>(
    `/jobs/${id}/stages?enteredAt=${encodeURIComponent(enteredAt)}&stage=${stage}`,
    "failed to delete stage entry",
    { method: "DELETE" },
  );
  // request returns undefined for a DELETE whose body didn't parse; the modal crashes on .filter.
  if (!Array.isArray(data)) {
    throw new Error("failed to delete stage entry");
  }
  return data;
}

export interface JobDetail {
  jobId: number;
  jdText: string;
  interviewNotes: string;
  recommendedResume: string | null;
  notes: string | null;
  rejectedReason: string | null;
  links: JobLink[];
  // Only the kinds that have been run.
  aiResults: JobAiResults;
  contacts: Contact[];
  // The resume file actually sent; Insights compares replies by it.
  sentResume: string | null;
}

export type ContactRole = "RECRUITER" | "HIRING_MANAGER" | "REFERRER" | "INTERVIEWER" | "OTHER";

export const CONTACT_ROLES: ContactRole[] = ["RECRUITER", "HIRING_MANAGER", "REFERRER", "INTERVIEWER", "OTHER"];

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  RECRUITER: "Recruiter",
  HIRING_MANAGER: "Hiring manager",
  REFERRER: "Referrer",
  INTERVIEWER: "Interviewer",
  OTHER: "Other",
};

export interface Contact {
  name: string;
  role: ContactRole;
  email: string | null;
  linkedInUrl: string | null;
  // yyyy-mm-dd
  lastContactedOn: string | null;
  notes: string | null;
  // yyyy-mm-dd; core clears it once lastContactedOn reaches it.
  followUpOn: string | null;
}

// Every field optional: core leaves an omitted field alone and clears one sent as "".
export interface UpdateJobDetailInput {
  jdText?: string;
  interviewNotes?: string;
  // Set once from the Add Job recommendation; omitted on later edits to preserve it.
  recommendedResume?: string;
  notes?: string | null;
  rejectedReason?: string | null;
  // The whole list, replacing what's saved.
  contacts?: Contact[];
  // A resume's file name; "" clears it.
  sentResume?: string;
}

export async function getJobDetail(id: number): Promise<JobDetail> {
  return request<JobDetail>(`/jobs/${id}/detail`, "failed to load job detail");
}

export async function updateJobDetail(id: number, input: UpdateJobDetailInput): Promise<JobDetail> {
  return request<JobDetail>(`/jobs/${id}/detail`, "failed to save job detail", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function linkJob(id: number, targetJobId: number, relation: JobRelation): Promise<JobLink[]> {
  return request<JobLink[]>(`/jobs/${id}/links`, "failed to link job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ targetJobId, relation }),
  });
}

export async function unlinkJob(id: number, targetJobId: number): Promise<JobLink[]> {
  const data = await request<JobLink[]>(`/jobs/${id}/links/${targetJobId}`, "failed to unlink job", { method: "DELETE" });
  // Same DELETE-without-a-body case as deleteJobStage; undefined crashes the modal on .some.
  if (!Array.isArray(data)) {
    throw new Error("failed to unlink job");
  }
  return data;
}

export type RowColor = "red" | "green" | "yellow" | "sky" | "indigo";

export function rowColor(job: Pick<JobSummary, "outcome" | "currentStage">): RowColor {
  if (CLOSED_OUTCOMES.includes(job.outcome)) {
    return "red";
  }
  if (job.outcome === "OFFER_ACCEPTED" || job.outcome === "OFFER_DECLINED") {
    return "green";
  }
  if (job.currentStage === "WAITING_INTERVIEW_RESULTS") {
    return "indigo";
  }
  if (job.currentStage === "INTERVIEW_REQUEST") {
    return "sky";
  }
  if (STAGE_ORDER.indexOf(job.currentStage) >= STAGE_ORDER.indexOf("INTERVIEW_STAGE")) {
    return "green";
  }
  return "yellow";
}
