import { LOCATIONS, OUTCOME_LABELS, SOURCE_CATEGORY_LABELS, type JobSummary, type Stage } from "./api/jobsApi";

// Words the importer's readStatus reads back to the same stage, so an export re-imports where it was.
const STAGE_WORDS: Record<Exclude<Stage, "FINALIZED">, string> = {
  RESUME_CHECK: "Applied",
  INTERVIEW_REQUEST: "Recruiter reached out",
  INTERVIEW_STAGE: "Interviewing",
  WAITING_INTERVIEW_RESULTS: "Interviewing, waiting on results",
  OFFER_STAGE: "Offer",
};

// Header names the importer's guessField recognises.
const HEADERS = ["Company", "Position", "Status", "Date applied", "Location", "City", "Salary min", "Salary max",
  "How applied", "Link"];

// A closed job sits at Finalized, which says nothing about how far it got; a logged round means it interviewed.
function statusOf(job: JobSummary): string {
  const stage = job.currentStage === "FINALIZED"
    ? (job.latestInterview ? STAGE_WORDS.INTERVIEW_STAGE : STAGE_WORDS.RESUME_CHECK)
    : STAGE_WORDS[job.currentStage];
  return job.outcome === "ACTIVE" ? stage : `${stage}, ${OUTCOME_LABELS[job.outcome]}`;
}

// A cell starting with = + - or @ runs as a formula in Excel and Sheets; text from a scraped posting could.
function cell(value: string | number | null): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(jobs: JobSummary[]): string {
  const rows = jobs.map(job => [
    job.company,
    job.role,
    statusOf(job),
    job.createdAt.slice(0, 10),
    LOCATIONS.find(location => location.value === job.location)?.label ?? null,
    job.city,
    job.compMin,
    job.compMax,
    SOURCE_CATEGORY_LABELS[job.sourceCategory],
    job.url,
  ].map(cell).join(","));
  // The byte-order mark is what makes Excel read the file as UTF-8 rather than mangling accents.
  return `﻿${[HEADERS.join(","), ...rows].join("\r\n")}\r\n`;
}

export function downloadCsv(fileName: string, jobs: JobSummary[]) {
  const url = URL.createObjectURL(new Blob([toCsv(jobs)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
