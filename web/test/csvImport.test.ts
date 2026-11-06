import { describe, it, expect } from "vitest";
import { guessField, parseCsv, readDate, readLocation, readSalary, readStatus, toImportRows } from "../src/csvImport";

describe("parseCsv", () => {
  it("reads quoted commas, doubled quotes, line breaks inside a field, and CRLF rows", () => {
    const text = '﻿Company,Notes\r\n"Initech, Inc.","said ""soon""\nthen nothing"\r\nGlobex,\r\n\r\n';

    expect(parseCsv(text)).toEqual([
      ["Company", "Notes"],
      ["Initech, Inc.", 'said "soon"\nthen nothing'],
      ["Globex", ""],
    ]);
  });
});

describe("guessField", () => {
  it("matches the headers a hand-made sheet and the trackers use", () => {
    const expected: Record<string, string> = {
      Company: "company", "Job Title": "role", Position: "role", "Job URL": "url", Location: "location",
      "Salary Range": "salary", Stage: "status", Status: "status", Application: "source", "Date Applied": "appliedOn",
      Notes: "notes", "Rejected Reason": "rejectedReason", "Favourite colour": "skip",
    };
    for (const [header, field] of Object.entries(expected)) {
      expect(guessField(header), header).toBe(field);
    }
  });
});

describe("readStatus", () => {
  it("reads where a job got to and how it ended, separately", () => {
    const expected: Record<string, ReturnType<typeof readStatus>> = {
      Applied: { stage: undefined, outcome: undefined },
      "Phone screen": { stage: "INTERVIEW_STAGE", outcome: undefined },
      "Recruiter reached out": { stage: "INTERVIEW_REQUEST", outcome: undefined },
      "Rejected after onsite": { stage: "INTERVIEW_STAGE", outcome: "REJECTED" },
      "Offer received": { stage: "OFFER_STAGE", outcome: undefined },
      "Offer declined": { stage: "OFFER_STAGE", outcome: "OFFER_DECLINED" },
      Accepted: { stage: undefined, outcome: "OFFER_ACCEPTED" },
      "No response": { stage: undefined, outcome: "GHOSTED" },
      Withdrawn: { stage: undefined, outcome: "WITHDRAWN" },
      "Hiring freeze": { stage: undefined, outcome: "PAUSED" },
    };
    for (const [text, status] of Object.entries(expected)) {
      expect(readStatus(text), text).toEqual(status);
    }
  });
});

describe("readLocation", () => {
  it("splits the work model from the place when one column holds both", () => {
    expect(readLocation("Hybrid (Austin, TX)")).toEqual({ location: "HYBRID", city: "Austin, TX" });
    expect(readLocation("NYC - Remote")).toEqual({ location: "REMOTE", city: "NYC" });
    expect(readLocation("On-site")).toEqual({ location: "ON_SITE", city: undefined });
    expect(readLocation("Toronto")).toEqual({ location: undefined, city: "Toronto" });
    expect(readLocation("")).toEqual({ location: undefined, city: undefined });
  });
});

describe("readSalary", () => {
  it("reads ranges the way people write them", () => {
    expect(readSalary("$150,000 - $190,000")).toEqual({ compMin: 150000, compMax: 190000 });
    expect(readSalary("$150-190k")).toEqual({ compMin: 150000, compMax: 190000 });
    expect(readSalary("120k to 140k")).toEqual({ compMin: 120000, compMax: 140000 });
    expect(readSalary("$95k")).toEqual({ compMin: 95000, compMax: undefined });
    expect(readSalary("competitive")).toEqual({});
  });
});

describe("readDate", () => {
  it("reads ISO and US dates and leaves out what it can't read", () => {
    expect(readDate("2026-03-02")).toBe("2026-03-02");
    expect(readDate("3/2/2026")).toBe("2026-03-02");
    expect(readDate("3/2/26")).toBe("2026-03-02");
    expect(readDate("last Tuesday")).toBeUndefined();
    expect(readDate("")).toBeUndefined();
  });
});

describe("toImportRows", () => {
  it("builds a job from each complete row and counts the rest", () => {
    const table = [
      ["Company", "Position", "Location", "Stage", "Notes", "Ignored"],
      ["Initech", "Engineer", "Hybrid, Austin", "Rejected", "Kind note", "x"],
      ["", "Engineer", "", "", "", ""],
      ["Globex", "Designer", "", "", "", ""],
    ];

    const { rows, incomplete } = toImportRows(table, table[0].map(guessField));

    expect(incomplete).toBe(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      company: "Initech", role: "Engineer", location: "HYBRID", city: "Austin", outcome: "REJECTED", notes: "Kind note",
    });
    expect(rows[1]).toMatchObject({ company: "Globex", role: "Designer", location: undefined, notes: undefined });
  });

  // Core refuses a backwards range, so one row written high-to-low mustn't sink the whole sheet.
  it("puts a salary range written backwards in order, from one column or two", () => {
    const table = [
      ["Company", "Position", "Salary", "Salary min", "Salary max"],
      ["Initech", "Engineer", "190-150k", "", ""],
      ["Globex", "Designer", "", "140000", "120000"],
    ];

    const { rows } = toImportRows(table, table[0].map(guessField));

    expect(rows[0]).toMatchObject({ compMin: 150000, compMax: 190000 });
    expect(rows[1]).toMatchObject({ compMin: 120000, compMax: 140000 });
  });
});
