import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  uploadResume,
  summarizeResume,
  setCustomResumeSummary,
  listResumes,
  deleteResume,
  matchResumeToJob,
} from "../../src/api/resumesApi";

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("uploadResume", () => {
  it("sends a multipart POST and returns the created resume", async () => {
    const resume = { id: "abc", fileName: "resume.txt", analysisStatus: "pending" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, resume));
    const file = new File(["hello"], "resume.txt", { type: "text/plain" });

    const result = await uploadResume(file);

    expect(fetch).toHaveBeenCalledWith("/resumes", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual(resume);
  });

  it("throws with the server's error message on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(400, { error: "unsupported file type" }));

    await expect(uploadResume(new File(["x"], "resume.exe"))).rejects.toThrow("unsupported file type");
  });
});

describe("summarizeResume", () => {
  it("posts with no body and returns the updated resume", async () => {
    const resume = { id: "abc", fileName: "resume.txt", analysisStatus: "ok", analysisSource: "ai" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, resume));

    const result = await summarizeResume("abc");

    expect(fetch).toHaveBeenCalledWith("/resumes/abc/summarize", expect.objectContaining({ method: "POST" }));
    expect(result).toEqual(resume);
  });

  it("throws with the server's error message on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(404, { error: "resume not found" }));

    await expect(summarizeResume("abc")).rejects.toThrow("resume not found");
  });
});

describe("setCustomResumeSummary", () => {
  it("posts the summary text and returns the updated resume", async () => {
    const resume = { id: "abc", fileName: "resume.txt", analysisStatus: "ok", analysisSource: "custom" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, resume));

    const result = await setCustomResumeSummary("abc", "Wrote this myself.");

    expect(fetch).toHaveBeenCalledWith(
      "/resumes/abc/custom-summary",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ summary: "Wrote this myself." }) }),
    );
    expect(result).toEqual(resume);
  });

  it("throws with the server's error message on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(400, { error: "summary is required" }));

    await expect(setCustomResumeSummary("abc", "")).rejects.toThrow("summary is required");
  });
});

describe("listResumes", () => {
  it("returns the list on success", async () => {
    const resumes = [{ id: "abc", fileName: "resume.txt" }];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, resumes));

    const result = await listResumes();

    expect(fetch).toHaveBeenCalledWith("/resumes");
    expect(result).toEqual(resumes);
  });
});

describe("deleteResume", () => {
  it("sends a DELETE request", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { deleted: true }));

    await deleteResume("abc");

    expect(fetch).toHaveBeenCalledWith("/resumes/abc", expect.objectContaining({ method: "DELETE" }));
  });
});

describe("matchResumeToJob", () => {
  it("posts the job text and returns the match result", async () => {
    const result = { status: "ok", fileName: "resume.txt", recommendation: "APPLY", reasoning: "Strong match." };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, result));

    const response = await matchResumeToJob("We need a backend engineer.");

    expect(fetch).toHaveBeenCalledWith(
      "/resumes/match",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ jobDescriptionText: "We need a backend engineer." }),
      }),
    );
    expect(response).toEqual(result);
  });
});
