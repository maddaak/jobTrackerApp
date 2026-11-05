import type { ImportJobRow, Location, Outcome, SourceCategory, Stage } from "./api/jobsApi";

// Quoted fields may hold commas, line breaks, and doubled quotes; Excel and Google Sheets both write them.
export function parseCsv(text: string): string[][] {
  const input = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);
  return rows.filter(cells => cells.some(cell => cell.trim()));
}

export type ImportField =
  | "company" | "role" | "url" | "location" | "city" | "salary" | "compMin" | "compMax"
  | "status" | "source" | "appliedOn" | "notes" | "rejectedReason" | "skip";

export const IMPORT_FIELD_LABELS: Record<ImportField, string> = {
  company: "Company",
  role: "Position",
  url: "Posting link",
  location: "Location",
  city: "City",
  salary: "Salary range",
  compMin: "Salary min",
  compMax: "Salary max",
  status: "Status or stage",
  source: "How you applied",
  appliedOn: "Date applied",
  notes: "Notes",
  rejectedReason: "Rejected reason",
  skip: "Don't import",
};

// Header names as trackers and people's own sheets spell them, compared lowercase with only the letters kept.
const HEADER_NAMES: Record<Exclude<ImportField, "skip">, string[]> = {
  company: ["company", "companyname", "employer", "organization", "organisation"],
  role: ["position", "role", "title", "jobtitle", "jobposition", "positiontitle", "job"],
  url: ["url", "joburl", "link", "joblink", "postingurl", "posting", "jobposting", "jobpostinglink"],
  location: ["location", "worktype", "workmodel", "remote", "arrangement", "workplace"],
  city: ["city", "office", "officelocation"],
  salary: ["salary", "salaryrange", "compensation", "pay", "comp", "payrange"],
  compMin: ["salarymin", "minsalary", "compmin", "minimumsalary"],
  compMax: ["salarymax", "maxsalary", "compmax", "maximumsalary"],
  status: ["status", "stage", "applicationstatus", "outcome", "result"],
  source: ["application", "source", "appliedvia", "howapplied", "method", "channel"],
  appliedOn: ["dateapplied", "applied", "applieddate", "appliedon", "date", "dateadded", "datesaved", "created"],
  notes: ["notes", "note", "comments", "comment"],
  rejectedReason: ["rejectedreason", "rejectionreason", "reason"],
};

export function guessField(header: string): ImportField {
  const key = header.toLowerCase().replace(/[^a-z]/g, "");
  const fields = Object.keys(HEADER_NAMES) as (keyof typeof HEADER_NAMES)[];
  return fields.find(field => HEADER_NAMES[field].includes(key)) ?? "skip";
}

// First match wins, so "offer declined" is read before "declined" and "rejected after the onsite" stays rejected.
const OUTCOME_WORDS: [RegExp, Outcome][] = [
  [/accept/, "OFFER_ACCEPTED"],
  [/offer.*declin|declin.*offer/, "OFFER_DECLINED"],
  [/reject|declin|denied|not selected|unsuccessful|not moving forward/, "REJECTED"],
  [/ghost|no response|no reply|never heard/, "GHOSTED"],
  [/withdr/, "WITHDRAWN"],
  [/closed|filled|cancel/, "POSITION_CLOSED"],
  [/pause|hold|freeze/, "PAUSED"],
];

const STAGE_WORDS: [RegExp, Exclude<Stage, "FINALIZED">][] = [
  [/offer/, "OFFER_STAGE"],
  // Ahead of interview, since the export writes this stage as "Interviewing, waiting on results".
  [/waiting|results/, "WAITING_INTERVIEW_RESULTS"],
  [/interview|screen|onsite|on-site|panel|round|technical|final/, "INTERVIEW_STAGE"],
  [/recruiter|contacted|reached out|request/, "INTERVIEW_REQUEST"],
];

export function readStatus(text: string): Pick<ImportJobRow, "stage" | "outcome"> {
  const lower = text.toLowerCase();
  return {
    stage: STAGE_WORDS.find(([pattern]) => pattern.test(lower))?.[1],
    outcome: OUTCOME_WORDS.find(([pattern]) => pattern.test(lower))?.[1],
  };
}

function readSource(text: string): SourceCategory | undefined {
  const lower = text.toLowerCase();
  if (!lower.trim()) return undefined;
  if (/referr/.test(lower)) return "REFERRAL_APPLIED";
  if (/linkedin/.test(lower) && /outreach|reached|message|recruiter|inmail/.test(lower)) return "LINKEDIN_OUTREACH";
  if (/email|e-mail/.test(lower)) return "EMAIL_OUTREACH";
  return "SELF_APPLIED";
}

const WORK_MODEL_WORDS = /\b(?:fully |100% )?remote\b|\bhybrid\b|\bon-?site\b|\bin[- ]person\b|\bin[- ]office\b/gi;

// One column often holds both, as "Hybrid (Austin, TX)" or "NYC - Remote"; what isn't the work model is the city.
export function readLocation(text: string): Pick<ImportJobRow, "location" | "city"> {
  const lower = text.toLowerCase();
  let location: Location | undefined;
  if (/hybrid/.test(lower)) location = "HYBRID";
  else if (/remote/.test(lower) && !/not remote|non-remote|no remote/.test(lower)) location = "REMOTE";
  else if (/on-?site|in[- ]person|in[- ]office/.test(lower)) location = "ON_SITE";
  const city = text.replace(WORK_MODEL_WORDS, "").replace(/^[\s\-–,()/|·:]+|[\s\-–,()/|·:]+$/g, "").trim();
  return { location, city: city ? city.slice(0, 100) : undefined };
}

function readAmount(text: string): number | undefined {
  const match = text.replace(/,/g, "").match(/(\d+(?:\.\d+)?)\s*([kK])?/);
  if (!match) return undefined;
  const value = Number(match[1]) * (match[2] ? 1000 : 1);
  // A sheet that writes "150 - 190" means thousands.
  return Math.round(value < 1000 ? value * 1000 : value);
}

export function readSalary(text: string): Pick<ImportJobRow, "compMin" | "compMax"> {
  const parts = text.replace(/,/g, "").split(/\s*(?:-|–|to)\s*/).filter(part => /\d/.test(part));
  if (parts.length === 0) return {};
  // A k on either end applies to both, since "$150-190k" means $150k-$190k.
  const k = /k/i.test(text) ? "k" : "";
  const min = readAmount(parts[0] + (/k/i.test(parts[0]) ? "" : k));
  const max = parts.length > 1 ? readAmount(parts[1] + (/k/i.test(parts[1]) ? "" : k)) : undefined;
  return { compMin: min, compMax: max };
}

const pad = (n: number) => String(n).padStart(2, "0");

// yyyy-mm-dd, or a US m/d/y as Excel and Sheets write it; anything else Date can read is taken as written.
export function readDate(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${pad(Number(iso[2]))}-${pad(Number(iso[3]))}`;
  const us = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (us) {
    const year = us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3]);
    return `${year}-${pad(Number(us[1]))}-${pad(Number(us[2]))}`;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

// Rows without a company or a position can't become jobs, so they're counted rather than sent.
export function toImportRows(table: string[][], fields: ImportField[]): { rows: ImportJobRow[]; incomplete: number } {
  const rows: ImportJobRow[] = [];
  let incomplete = 0;
  for (const cells of table.slice(1)) {
    const valueOf = (field: ImportField) =>
      fields.map((f, i) => (f === field ? (cells[i] ?? "").trim() : "")).find(Boolean) ?? "";
    const company = valueOf("company").slice(0, 255);
    const role = valueOf("role").slice(0, 255);
    if (!company || !role) {
      incomplete++;
      continue;
    }
    const placed = readLocation(valueOf("location"));
    const salary = readSalary(valueOf("salary"));
    const compMin = salary.compMin ?? readAmount(valueOf("compMin"));
    const compMax = salary.compMax ?? readAmount(valueOf("compMax"));
    // "190-150" still means 150 to 190, and core refuses a range written backwards.
    const reversed = compMin !== undefined && compMax !== undefined && compMin > compMax;
    const status = readStatus(valueOf("status"));
    const row: ImportJobRow = {
      company,
      role,
      sourceCategory: readSource(valueOf("source")),
      url: valueOf("url") || undefined,
      location: placed.location,
      city: valueOf("city").slice(0, 100) || placed.city,
      compMin: reversed ? compMax : compMin,
      compMax: reversed ? compMin : compMax,
      notes: valueOf("notes") || undefined,
      stage: status.stage,
      outcome: status.outcome,
      appliedOn: readDate(valueOf("appliedOn")),
      rejectedReason: valueOf("rejectedReason") || undefined,
    };
    rows.push(row);
  }
  return { rows, incomplete };
}
