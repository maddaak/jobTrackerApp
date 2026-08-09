import { describe, it, expect, vi, beforeEach } from "vitest";
import { updateJob, deleteJob, rowColor, type JobSummary, type UpdateJobInput } from "../../src/api/jobsApi";

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

describe("rowColor", () => {
  const cases: [Pick<JobSummary, "outcome" | "currentStage">, "red" | "green" | "yellow"][] = [
    [{ outcome: "REJECTED", currentStage: "RESUME_CHECK" }, "red"],
    [{ outcome: "GHOSTED", currentStage: "INTERVIEW_STAGE" }, "red"],
    [{ outcome: "WITHDRAWN", currentStage: "OFFER_STAGE" }, "red"],
    [{ outcome: "OFFER_ACCEPTED", currentStage: "RESUME_CHECK" }, "green"],
    [{ outcome: "OFFER_DECLINED", currentStage: "RESUME_CHECK" }, "green"],
    [{ outcome: "ACTIVE", currentStage: "INTERVIEW_STAGE" }, "green"],
    [{ outcome: "ACTIVE", currentStage: "WAITING_INTERVIEW_RESULTS" }, "green"],
    [{ outcome: "ACTIVE", currentStage: "RESUME_CHECK" }, "yellow"],
    [{ outcome: "ACTIVE", currentStage: "INTERVIEW_REQUEST" }, "yellow"],
  ];

  it.each(cases)("returns %o -> %s", (job, expected) => {
    expect(rowColor(job)).toBe(expected);
  });
});
