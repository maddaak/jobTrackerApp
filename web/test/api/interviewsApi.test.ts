import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createInterview,
  updateInterview,
  listInterviews,
  INTERVIEW_TYPES,
  INTERVIEW_TYPE_LABELS,
  type CreateInterviewInput,
  type UpdateInterviewInput,
} from "../../src/api/interviewsApi";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

const createInput: CreateInterviewInput = {
  jobId: 1,
  stage: "INTERVIEW_STAGE",
  interviewDateTime: "2026-08-01T18:00:00.000Z",
};

const updateInput: UpdateInterviewInput = {
  interviewDateTime: "2026-08-05T15:30:00.000Z",
  interviewType: "BEHAVIOR",
  meetingLink: null,
  location: null,
  interviewers: [],
};

describe("interview types", () => {
  it("includes take-home assignment and technical code review with their labels", () => {
    expect(INTERVIEW_TYPES).toContain("TAKE_HOME_ASSIGNMENT");
    expect(INTERVIEW_TYPES).toContain("TECHNICAL_CODE_REVIEW");
    expect(INTERVIEW_TYPE_LABELS.TAKE_HOME_ASSIGNMENT).toBe("Take Home Assignment");
    expect(INTERVIEW_TYPE_LABELS.TECHNICAL_CODE_REVIEW).toBe("Technical Code Review");
  });

  it("has exactly one label per type (labels map is 1:1 with the type list)", () => {
    expect(Object.keys(INTERVIEW_TYPE_LABELS).sort()).toEqual([...INTERVIEW_TYPES].sort());
    for (const type of INTERVIEW_TYPES) {
      expect(INTERVIEW_TYPE_LABELS[type]).toBeTruthy();
    }
  });
});

describe("createInterview", () => {
  it("sends a POST with the input and returns the created interview on success", async () => {
    const interview = { roundId: "round-5", jobId: 1 };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(interview) });

    const result = await createInterview(createInput);

    expect(fetch).toHaveBeenCalledWith(
      "/interviews",
      expect.objectContaining({ method: "POST", body: JSON.stringify(createInput) }),
    );
    expect(result).toEqual(interview);
  });

  it("throws with the server's error message on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "job not found" }),
    });

    await expect(createInterview(createInput)).rejects.toThrow("job not found");
  });
});

describe("updateInterview", () => {
  it("sends a PATCH with the input and returns the updated interview on success", async () => {
    const interview = { roundId: "round-5", interviewType: "BEHAVIOR" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(interview) });

    const result = await updateInterview("round-5", updateInput);

    expect(fetch).toHaveBeenCalledWith(
      "/interviews/round-5",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify(updateInput) }),
    );
    expect(result).toEqual(interview);
  });

  it("throws with the server's error message on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "job not found" }),
    });

    await expect(updateInterview("round-5", updateInput)).rejects.toThrow("job not found");
  });
});

describe("listInterviews", () => {
  it("returns the list on success", async () => {
    const interviews = [{ roundId: "round-5", jobId: 1, company: "Acme" }];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(interviews) });

    const result = await listInterviews();

    expect(fetch).toHaveBeenCalledWith("/interviews");
    expect(result).toEqual(interviews);
  });

  it("throws on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });

    await expect(listInterviews()).rejects.toThrow("failed to load interviews");
  });
});
