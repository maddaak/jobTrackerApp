import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";

const JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";

function authCookie(userId = "1", username = "alice") {
  const token = jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" });
  return `token=${token}`;
}

function fakeResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("POST /resumes", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).post("/resumes");
    expect(res.status).toBe(401);
  });

  it("returns 400 when no file is attached", async () => {
    const res = await request(app).post("/resumes").set("Cookie", authCookie());
    expect(res.status).toBe(400);
  });

  it("creates the resume and returns it as-is, without triggering any analysis", async () => {
    const created = { id: "abc", fileName: "resume.txt", extractedText: "Backend engineer.", uploadedAt: "2026-01-01" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, created));

    const res = await request(app)
      .post("/resumes")
      .set("Cookie", authCookie("42"))
      .attach("file", Buffer.from("Backend engineer."), "resume.txt");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(created);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/resumes"), expect.objectContaining({ method: "POST" }));
  });
});

describe("POST /resumes/:id/summarize", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).post("/resumes/abc/summarize");
    expect(res.status).toBe(401);
  });

  it("fetches the stored text, analyzes it, and caches the result with source ai", async () => {
    const analysis = { summary: "Backend engineer", skills: ["Go"], seniority: "senior", roles: ["Backend"] };
    const patched = { id: "abc", fileName: "resume.txt", analysisStatus: "ok", analysisSource: "ai", summary: "Backend engineer" };

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, { id: "abc", extractedText: "Backend engineer." }))
      .mockResolvedValueOnce(fakeResponse(200, analysis))
      .mockResolvedValueOnce(fakeResponse(200, patched));

    const res = await request(app).post("/resumes/abc/summarize").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(patched);
    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining("/resumes/abc/text"), expect.anything());
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining("/analyze-resume"), expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/resumes/abc/analysis"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ analysisJson: JSON.stringify(analysis), status: "ok", source: "ai" }),
      }),
    );
  });

  it("caches a not_configured status without an analysisJson or source when the scraper has no key", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, { id: "abc", extractedText: "Backend engineer." }))
      .mockResolvedValueOnce(fakeResponse(503, { error: "not_configured" }))
      .mockResolvedValueOnce(fakeResponse(200, { id: "abc", analysisStatus: "not_configured" }));

    const res = await request(app).post("/resumes/abc/summarize").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/resumes/abc/analysis"),
      expect.objectContaining({ body: JSON.stringify({ analysisJson: null, status: "not_configured", source: null }) }),
    );
  });

  it("proxies core's 404 through unchanged when the resume isn't the caller's", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(404, { error: "resume not found" }));

    const res = await request(app).post("/resumes/abc/summarize").set("Cookie", authCookie("42"));

    expect(res.status).toBe(404);
  });
});

describe("POST /resumes/:id/custom-summary", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).post("/resumes/abc/custom-summary").send({ summary: "x" });
    expect(res.status).toBe(401);
  });

  it("returns 400 without a summary", async () => {
    const res = await request(app).post("/resumes/abc/custom-summary").set("Cookie", authCookie()).send({});
    expect(res.status).toBe(400);
  });

  it("stores the custom summary directly, with no scraper call", async () => {
    const patched = { id: "abc", fileName: "resume.txt", analysisStatus: "ok", analysisSource: "custom", summary: "Wrote this myself." };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, patched));

    const res = await request(app)
      .post("/resumes/abc/custom-summary")
      .set("Cookie", authCookie("42"))
      .send({ summary: "Wrote this myself." });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(patched);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/resumes/abc/analysis"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          analysisJson: JSON.stringify({ summary: "Wrote this myself.", skills: [], seniority: null, roles: [] }),
          status: "ok",
          source: "custom",
        }),
      }),
    );
  });
});

describe("GET /resumes", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).get("/resumes");
    expect(res.status).toBe(401);
  });

  it("proxies the caller's resumes", async () => {
    const resumes = [{ id: "abc", fileName: "resume.txt" }];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, resumes));

    const res = await request(app).get("/resumes").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(resumes);
  });
});

describe("DELETE /resumes/:id", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).delete("/resumes/abc");
    expect(res.status).toBe(401);
  });

  it("returns 400 for a malformed id without calling core", async () => {
    const res = await request(app).delete("/resumes/bad%2Fid").set("Cookie", authCookie());
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("proxies the delete", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(200, { deleted: true }));

    const res = await request(app).delete("/resumes/abc").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
  });
});

describe("POST /resumes/match", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).post("/resumes/match").send({ jobDescriptionText: "a job" });
    expect(res.status).toBe(401);
  });

  it("returns 400 without jobDescriptionText", async () => {
    const res = await request(app).post("/resumes/match").set("Cookie", authCookie()).send({});
    expect(res.status).toBe(400);
  });

  it("proxies core's error status instead of crashing when the resumes list call fails", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeResponse(401, { error: "missing or invalid internal token" }));

    const res = await request(app)
      .post("/resumes/match")
      .set("Cookie", authCookie())
      .send({ jobDescriptionText: "We need a backend engineer." });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: "missing or invalid internal token" });
  });

  it("returns no_resumes without calling the scraper when nothing is analyzed", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeResponse(200, [{ id: "abc", fileName: "resume.txt", analysisStatus: "pending", summary: null }]),
    );

    const res = await request(app)
      .post("/resumes/match")
      .set("Cookie", authCookie())
      .send({ jobDescriptionText: "We need a backend engineer." });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "no_resumes" });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("excludes a resume whose text could not be read rather than sending it blank", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, [
        { id: "abc", fileName: "good.txt", analysisStatus: "ok", summary: "Backend engineer" },
        { id: "xyz", fileName: "broken.txt", analysisStatus: "ok", summary: "Frontend engineer" },
      ]))
      .mockResolvedValueOnce(fakeResponse(200, { id: "abc", extractedText: "Real resume text." }))
      .mockResolvedValueOnce(fakeResponse(500, { error: "boom" }))
      .mockResolvedValueOnce(fakeResponse(200, { bestResumeId: "abc", recommendation: "APPLY", reasoning: "Strong." }));

    const res = await request(app)
      .post("/resumes/match")
      .set("Cookie", authCookie())
      .send({ jobDescriptionText: "We need a backend engineer." });

    expect(res.status).toBe(200);
    // The unreadable resume must not reach the model as a blank candidate, and the caller is told.
    expect(res.body.skippedResumes).toBe(1);
    const scraperCall = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(c =>
      String(c[0]).includes("/match-resume"),
    );
    expect(JSON.parse(scraperCall![1].body).resumes).toEqual([
      { id: "abc", fileName: "good.txt", fullText: "Real resume text." },
    ]);
  });

  it("fails instead of guessing when no resume text could be read at all", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, [
        { id: "abc", fileName: "resume.txt", analysisStatus: "ok", summary: "Backend engineer" },
      ]))
      .mockResolvedValueOnce(fakeResponse(500, { error: "boom" }));

    const res = await request(app)
      .post("/resumes/match")
      .set("Cookie", authCookie())
      .send({ jobDescriptionText: "We need a backend engineer." });

    expect(res.status).toBe(502);
    expect(fetch).not.toHaveBeenCalledWith(expect.stringContaining("/match-resume"), expect.anything());
  });

  it("fails when the model picks an id that is not one of the caller's resumes", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, [
        { id: "abc", fileName: "resume.txt", analysisStatus: "ok", summary: "Backend engineer" },
      ]))
      .mockResolvedValueOnce(fakeResponse(200, { id: "abc", extractedText: "Real resume text." }))
      .mockResolvedValueOnce(fakeResponse(200, { bestResumeId: "", recommendation: "APPLY", reasoning: "Strong." }));

    const res = await request(app)
      .post("/resumes/match")
      .set("Cookie", authCookie())
      .send({ jobDescriptionText: "We need a backend engineer." });

    // Previously this rendered as a normal recommendation for "unknown resume".
    expect(res.status).toBe(502);
  });

  it("fetches each analyzed resume's full text and sends it to the scraper, not the cached summary", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, [
        { id: "abc", fileName: "resume.txt", analysisStatus: "ok", summary: "Backend engineer", skills: ["Go"], seniority: "senior", roles: ["Backend"] },
      ]))
      .mockResolvedValueOnce(fakeResponse(200, { id: "abc", extractedText: "Full resume text with more detail." }))
      .mockResolvedValueOnce(fakeResponse(200, { bestResumeId: "abc", recommendation: "APPLY", reasoning: "Strong match." }));

    const res = await request(app)
      .post("/resumes/match")
      .set("Cookie", authCookie())
      .send({ jobDescriptionText: "We need a backend engineer." });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", fileName: "resume.txt", recommendation: "APPLY", reasoning: "Strong match." });
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining("/resumes/abc/text"), expect.anything());
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/match-resume"),
      expect.objectContaining({
        body: JSON.stringify({
          jobDescriptionText: "We need a backend engineer.",
          resumes: [{ id: "abc", fileName: "resume.txt", fullText: "Full resume text with more detail." }],
        }),
      }),
    );
  });

  it("maps the scraper's INSUFFICIENT_JD verdict to an insufficient_jd status", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, [
        { id: "abc", fileName: "resume.txt", analysisStatus: "ok", summary: "Backend engineer", skills: [], seniority: "senior", roles: [] },
      ]))
      .mockResolvedValueOnce(fakeResponse(200, { id: "abc", extractedText: "Full resume text." }))
      .mockResolvedValueOnce(fakeResponse(200, { bestResumeId: "", recommendation: "INSUFFICIENT_JD", reasoning: "Nav markup, not a job description." }));

    const res = await request(app)
      .post("/resumes/match")
      .set("Cookie", authCookie())
      .send({ jobDescriptionText: "Home About Careers Accept cookies" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "insufficient_jd" });
  });

  it("maps the scraper's no-key 503 to a not_configured status", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, [
        { id: "abc", fileName: "resume.txt", analysisStatus: "ok", summary: "Backend engineer", skills: [], seniority: "senior", roles: [] },
      ]))
      .mockResolvedValueOnce(fakeResponse(200, { id: "abc", extractedText: "Full resume text." }))
      .mockResolvedValueOnce(fakeResponse(503, { error: "not_configured" }));

    const res = await request(app)
      .post("/resumes/match")
      .set("Cookie", authCookie())
      .send({ jobDescriptionText: "We need a backend engineer." });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "not_configured" });
  });

  it("returns unavailable when the scraper's AI call fails", async () => {
    // 502 is transient so callScraperAi retries; mock every attempt.
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, [
        { id: "abc", fileName: "resume.txt", analysisStatus: "ok", summary: "Backend engineer", skills: [], seniority: "senior", roles: [] },
      ]))
      .mockResolvedValueOnce(fakeResponse(200, { id: "abc", extractedText: "Full resume text." }))
      .mockResolvedValue(fakeResponse(502, { error: "unavailable" }));

    const res = await request(app)
      .post("/resumes/match")
      .set("Cookie", authCookie())
      .send({ jobDescriptionText: "We need a backend engineer." });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "unavailable" });
  });
});
