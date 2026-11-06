import { describe, it, expect } from "vitest";
import { toIcs } from "../src/calendarFile";
import type { Interview } from "../src/api/interviewsApi";

function round(overrides: Partial<Interview> = {}): Interview {
  return {
    roundId: "r1", jobId: 1, company: "Initech", role: "Backend Engineer", stage: "INTERVIEW_STAGE",
    interviewDateTime: "2026-11-02T15:00:00Z", interviewEndDateTime: "2026-11-02T15:45:00Z",
    interviewType: "SYSTEM_DESIGN", meetingLink: "https://meet.example/abc", location: null,
    interviewers: [{ name: "Ada" }, { name: "Grace" }], aiResults: {},
    ...overrides,
  } as Interview;
}

function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

describe("toIcs", () => {
  it("writes one event per round, in UTC, with CRLF line endings", () => {
    const ics = toIcs([round(), round({ roundId: "r2", interviewDateTime: "2026-11-05T14:00:00Z", interviewEndDateTime: null })],
      new Date("2026-10-13T00:00:00Z"));
    const lines = unfold(ics);

    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(lines.filter(line => line === "BEGIN:VEVENT")).toHaveLength(2);
    expect(lines).toContain("UID:r1@job-tracker");
    expect(lines).toContain("DTSTART:20261102T150000Z");
    expect(lines).toContain("DTEND:20261102T154500Z");
    expect(lines).toContain("DTSTAMP:20261013T000000Z");
    expect(lines).toContain("LOCATION:https://meet.example/abc");
    // A round with no end gets the app's default length.
    expect(lines).toContain("DTEND:20261105T150000Z");
  });

  it("escapes what the format reserves and folds long lines", () => {
    const ics = toIcs([round({ company: "Initech, Inc; Labs", role: "A".repeat(120), location: "1 Main St" })]);

    expect(unfold(ics)).toContain("LOCATION:1 Main St");
    expect(unfold(ics).some(line => line.startsWith("SUMMARY:") && line.includes("Initech\\, Inc\\; Labs"))).toBe(true);
    expect(unfold(ics).find(line => line.startsWith("DESCRIPTION:"))).toContain("\\nWith Ada\\, Grace\\n");
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
  });
});
