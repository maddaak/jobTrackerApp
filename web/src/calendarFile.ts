import { INTERVIEW_TYPE_LABELS, type Interview } from "./api/interviewsApi";
import { DEFAULT_LENGTH_MS } from "./interviewTimes";

// A file rather than a subscription link: a calendar service can't reach an app on someone's own machine.

function icsTime(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

// Lines over 75 octets continue on the next line after a space, as the format requires.
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const charSize = new TextEncoder().encode(char).length;
    if (size + charSize > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += charSize;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function event(round: Interview, stamp: string): string[] {
  const end = round.interviewEndDateTime
    ?? new Date(new Date(round.interviewDateTime).getTime() + DEFAULT_LENGTH_MS).toISOString();
  const kind = round.interviewType ? INTERVIEW_TYPE_LABELS[round.interviewType] : "Interview";
  const details = [
    round.role,
    round.interviewers.length > 0 ? `With ${round.interviewers.map(person => person.name).join(", ")}` : "",
    round.meetingLink ?? "",
  ].filter(Boolean).join("\n");
  return [
    "BEGIN:VEVENT",
    // Stable per round, so importing an edited round again updates it in calendars that honour UIDs.
    `UID:${round.roundId}@job-tracker`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${icsTime(round.interviewDateTime)}`,
    `DTEND:${icsTime(end)}`,
    `SUMMARY:${escapeText(`${kind}: ${round.company}`)}`,
    `DESCRIPTION:${escapeText(details)}`,
    ...(round.location || round.meetingLink ? [`LOCATION:${escapeText(round.location || round.meetingLink || "")}`] : []),
    "END:VEVENT",
  ];
}

export function toIcs(rounds: Interview[], now = new Date()): string {
  const stamp = icsTime(now.toISOString());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Job Tracker//Interviews//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...rounds.flatMap(round => event(round, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(fileName: string, rounds: Interview[]) {
  const url = URL.createObjectURL(new Blob([toIcs(rounds)], { type: "text/calendar;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
