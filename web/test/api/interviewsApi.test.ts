import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createInterview,
  updateInterview,
  listInterviews,
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

describe("createInterview", () => {
  it("sends a POST with the input and returns the created interview on success", async () => {
    const interview = { stageEventId: 5, jobId: 1 };
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
    const interview = { stageEventId: 5, interviewType: "BEHAVIOR" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(interview) });

    const result = await updateInterview(5, updateInput);

    expect(fetch).toHaveBeenCalledWith(
      "/interviews/5",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify(updateInput) }),
    );
    expect(result).toEqual(interview);
  });

  it("throws with the server's error message on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "job not found" }),
    });

    await expect(updateInterview(5, updateInput)).rejects.toThrow("job not found");
  });
});

describe("listInterviews", () => {
  it("returns the list on success", async () => {
    const interviews = [{ stageEventId: 5, jobId: 1, company: "Acme" }];
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
