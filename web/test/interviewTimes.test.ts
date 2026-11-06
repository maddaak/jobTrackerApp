import { describe, it, expect } from "vitest";
import { endFollowingStart } from "../src/interviewTimes";

describe("endFollowingStart", () => {
  it("drags the end along with the start, keeping the round's length", () => {
    expect(endFollowingStart("2026-08-01T15:00", "2026-08-01T14:00", "2026-08-01T14:45")).toBe("2026-08-01T15:45");
  });

  it("fills an hour when the start is first typed, so the inline cell needs no second step", () => {
    expect(endFollowingStart("2026-08-01T15:00", "", "")).toBe("2026-08-01T16:00");
  });

  it("keeps a moved round's blank end blank rather than inventing an hour", () => {
    expect(endFollowingStart("2026-08-01T15:00", "2026-08-01T14:00", "")).toBe("");
  });

  it("leaves the end alone while the start is half typed", () => {
    expect(endFollowingStart("", "2026-08-01T14:00", "2026-08-01T14:45")).toBe("2026-08-01T14:45");
  });
});
