import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  updateJob,
  deleteJob,
  deleteJobStage,
  unlinkJob,
  rowColor,
  type JobSummary,
  type UpdateJobInput,
  type RowColor,
} from "../../src/api/jobsApi";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

const baseInput: UpdateJobInput = {
  company: "Acme",
  role: "Engineer",
  sourceCategory: "SELF_APPLIED",
  url: null,
  location: null,
  compMin: null,
  compMax: null,
  currentStage: "RESUME_CHECK",
  outcome: "ACTIVE",
};

describe("updateJob", () => {
  it("sends a PATCH with the full input and returns the updated job on success", async () => {
    const job = { id: 1, company: "Acme" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(job),
    });

    const result = await updateJob(1, baseInput);

    expect(fetch).toHaveBeenCalledWith(
      "/jobs/1",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify(baseInput) }),
    );
    expect(result).toEqual(job);
  });

  it("throws with the server's error message on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "job not found" }),
    });

    await expect(updateJob(1, baseInput)).rejects.toThrow("job not found");
  });
});

describe("deleteJob", () => {
  it("sends a DELETE request", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    await deleteJob(1);

    expect(fetch).toHaveBeenCalledWith("/jobs/1", expect.objectContaining({ method: "DELETE" }));
  });

  it("throws with the server's error message on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      json: () => Promise.resolve({ error: "job not found" }),
    });

    await expect(deleteJob(1)).rejects.toThrow("job not found");
  });
});

// request() returns undefined for a DELETE whose body doesn't parse, which the modal then crashes on.
describe("DELETE endpoints the modal renders from", () => {
  const emptyBodyOk = { ok: true, status: 200, json: () => Promise.reject(new Error("not json")) };

  it("rejects rather than returning undefined from deleteJobStage", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(emptyBodyOk);

    await expect(deleteJobStage(1, "2026-08-26T20:24:30.000Z", "RESUME_CHECK")).rejects.toThrow("failed to delete stage entry");
  });

  it("rejects rather than returning undefined from unlinkJob", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(emptyBodyOk);

    await expect(unlinkJob(1, 9)).rejects.toThrow("failed to unlink job");
  });
});

describe("rowColor", () => {
  const cases: [Pick<JobSummary, "outcome" | "currentStage">, RowColor][] = [
    [{ outcome: "REJECTED", currentStage: "RESUME_CHECK" }, "red"],
    [{ outcome: "GHOSTED", currentStage: "INTERVIEW_STAGE" }, "red"],
    [{ outcome: "WITHDRAWN", currentStage: "OFFER_STAGE" }, "red"],
    [{ outcome: "REJECTED", currentStage: "WAITING_INTERVIEW_RESULTS" }, "red"],
    [{ outcome: "OFFER_ACCEPTED", currentStage: "RESUME_CHECK" }, "green"],
    [{ outcome: "OFFER_DECLINED", currentStage: "RESUME_CHECK" }, "green"],
    [{ outcome: "ACTIVE", currentStage: "INTERVIEW_STAGE" }, "green"],
    [{ outcome: "ACTIVE", currentStage: "OFFER_STAGE" }, "green"],
    [{ outcome: "ACTIVE", currentStage: "WAITING_INTERVIEW_RESULTS" }, "indigo"],
    [{ outcome: "ACTIVE", currentStage: "RESUME_CHECK" }, "yellow"],
    [{ outcome: "ACTIVE", currentStage: "INTERVIEW_REQUEST" }, "sky"],
    [{ outcome: "REJECTED", currentStage: "INTERVIEW_REQUEST" }, "red"],
  ];

  it.each(cases)("returns %o -> %s", (job, expected) => {
    expect(rowColor(job)).toBe(expected);
  });
});
