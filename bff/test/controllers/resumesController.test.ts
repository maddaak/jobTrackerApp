import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";

const JWT_SECRET = "test-secret-not-for-production";

function authCookie(userId = "1", username = "alice") {
  const token = jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: "7d" });
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

  it("orchestrates create -> analyze -> apply-analysis and returns the final resume", async () => {
    const created = { id: "abc", fileName: "resume.txt", extractedText: "Backend engineer.", uploadedAt: "2026-01-01" };
    const analysis = { summary: "Backend engineer", skills: ["Go"], seniority: "senior", roles: ["Backend"] };
    const patched = { id: "abc", fileName: "resume.txt", analysisStatus: "ok", summary: "Backend engineer" };

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, created))
      .mockResolvedValueOnce(fakeResponse(200, analysis))
      .mockResolvedValueOnce(fakeResponse(200, patched));

    const res = await request(app)
      .post("/resumes")
      .set("Cookie", authCookie("42"))
      .attach("file", Buffer.from("Backend engineer."), "resume.txt");

    expect(res.status).toBe(200);
    expect(res.body).toEqual(patched);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining("/resumes"), expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining("/analyze-resume"), expect.objectContaining({ method: "POST" }));
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/resumes/abc/analysis"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ analysisJson: JSON.stringify(analysis), status: "ok" }),
      }),
    );
  });

  it("caches a not_configured status without an analysisJson when the scraper has no key", async () => {
    const created = { id: "abc", fileName: "resume.txt", extractedText: "Backend engineer.", uploadedAt: "2026-01-01" };

    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, created))
      .mockResolvedValueOnce(fakeResponse(503, { error: "not_configured" }))
      .mockResolvedValueOnce(fakeResponse(200, { id: "abc", analysisStatus: "not_configured" }));

    const res = await request(app)
      .post("/resumes")
      .set("Cookie", authCookie("42"))
      .attach("file", Buffer.from("Backend engineer."), "resume.txt");

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining("/resumes/abc/analysis"),
      expect.objectContaining({ body: JSON.stringify({ analysisJson: null, status: "not_configured" }) }),
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

  it("returns the recommendation with the matched resume's fileName", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, [
        { id: "abc", fileName: "resume.txt", analysisStatus: "ok", summary: "Backend engineer", skills: ["Go"], seniority: "senior", roles: ["Backend"] },
      ]))
      .mockResolvedValueOnce(fakeResponse(200, { bestResumeId: "abc", recommendation: "APPLY", reasoning: "Strong match." }));

    const res = await request(app)
      .post("/resumes/match")
      .set("Cookie", authCookie())
      .send({ jobDescriptionText: "We need a backend engineer." });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", fileName: "resume.txt", recommendation: "APPLY", reasoning: "Strong match." });
  });

  it("returns unavailable when the scraper's AI call fails", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeResponse(200, [
        { id: "abc", fileName: "resume.txt", analysisStatus: "ok", summary: "Backend engineer", skills: [], seniority: "senior", roles: [] },
      ]))
      .mockResolvedValueOnce(fakeResponse(502, { error: "unavailable" }));

    const res = await request(app)
      .post("/resumes/match")
      .set("Cookie", authCookie())
      .send({ jobDescriptionText: "We need a backend engineer." });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "unavailable" });
  });
});
