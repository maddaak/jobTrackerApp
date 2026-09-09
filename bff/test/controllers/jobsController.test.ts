import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";

const JWT_SECRET = "test-secret-not-for-production-use-only-in-tests-hs512-min-64-bytes";

function authCookie(userId = "1", username = "alice") {
  const token = jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: "7d", algorithm: "HS512" });
  return `token=${token}`;
}

function fakeCoreResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("POST /jobs", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).post("/jobs").send({ company: "Acme", role: "Engineer" });
    expect(res.status).toBe(401);
  });

  it("forwards the caller's id to core and returns the created job", async () => {
    const job = { id: 1, company: "Acme", role: "Engineer", currentStage: "RESUME_CHECK", outcome: "ACTIVE" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, job));

    const res = await request(app)
      .post("/jobs")
      .set("Cookie", authCookie("42"))
      .send({ company: "Acme", role: "Engineer", sourceCategory: "SELF_APPLIED" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual(job);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
      }),
    );
  });

  it("proxies core's 400 (validation failure) through unchanged", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(400, { error: "company must not be blank" }),
    );

    const res = await request(app).post("/jobs").set("Cookie", authCookie()).send({ role: "Engineer" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "company must not be blank" });
  });
});

describe("GET /jobs", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).get("/jobs");
    expect(res.status).toBe(401);
  });

  it("returns the caller's jobs", async () => {
    const jobs = [{ id: 1, company: "Acme" }];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, jobs));

    const res = await request(app).get("/jobs").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(jobs);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs"),
      expect.objectContaining({ headers: expect.objectContaining({ "X-User-Id": "42" }) }),
    );
  });
});

describe("GET /jobs/:id", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).get("/jobs/1");
    expect(res.status).toBe(401);
  });

  it("returns the job when core finds it", async () => {
    const job = { id: 1, company: "Acme", stageEvents: [] };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, job));

    const res = await request(app).get("/jobs/1").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(job);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/jobs/1"), expect.anything());
  });

  it("proxies core's 404 through unchanged when the job isn't the caller's", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(404, { error: "job not found" }));

    const res = await request(app).get("/jobs/1").set("Cookie", authCookie());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "job not found" });
  });
});

describe("GET /jobs/:id id validation", () => {
  it("returns 400 for a non-numeric id without calling core", async () => {
    const res = await request(app).get("/jobs/..%2Fadmin").set("Cookie", authCookie());
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("PATCH /jobs/:id", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).patch("/jobs/1").send({ company: "Acme" });
    expect(res.status).toBe(401);
  });

  it("forwards the caller's id and patch body to core and returns the updated job", async () => {
    const job = { id: 1, company: "Acme", currentStage: "INTERVIEW_STAGE" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, job));

    const patch = { company: "Acme", role: "Engineer", sourceCategory: "SELF_APPLIED",
      currentStage: "INTERVIEW_STAGE", outcome: "ACTIVE" };
    const res = await request(app).patch("/jobs/1").set("Cookie", authCookie("42")).send(patch);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(job);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/1"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
        body: JSON.stringify(patch),
      }),
    );
  });

  it("proxies core's 404 through unchanged when the job isn't the caller's", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(404, { error: "job not found" }));

    const res = await request(app).patch("/jobs/1").set("Cookie", authCookie()).send({ company: "Acme" });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "job not found" });
  });

  it("proxies core's 400 (validation failure) through unchanged", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(400, { error: "company must not be blank" }),
    );

    const res = await request(app).patch("/jobs/1").set("Cookie", authCookie()).send({ role: "Engineer" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "company must not be blank" });
  });
});

describe("DELETE /jobs/:id", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).delete("/jobs/1");
    expect(res.status).toBe(401);
  });

  it("forwards the caller's id to core and returns success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, { deleted: true }));

    const res = await request(app).delete("/jobs/1").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/1"),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
      }),
    );
  });

  it("proxies core's 404 through unchanged when the job isn't the caller's", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(404, { error: "job not found" }));

    const res = await request(app).delete("/jobs/1").set("Cookie", authCookie());

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "job not found" });
  });
});

describe("GET /jobs/:id/detail", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).get("/jobs/1/detail");
    expect(res.status).toBe(401);
  });

  it("returns the caller's job detail", async () => {
    const detail = { jobId: 1, jdText: "we are hiring...", interviewNotes: "" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, detail));

    const res = await request(app).get("/jobs/1/detail").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(detail);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/1/detail"),
      expect.objectContaining({ headers: expect.objectContaining({ "X-User-Id": "42" }) }),
    );
  });
});

describe("PUT /jobs/:id/detail", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).put("/jobs/1/detail").send({ jdText: "x", interviewNotes: "" });
    expect(res.status).toBe(401);
  });

  it("forwards the patch body and returns the updated detail", async () => {
    const detail = { jobId: 1, jdText: "updated jd", interviewNotes: "" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, detail));

    const patch = { jdText: "updated jd", interviewNotes: "" };
    const res = await request(app).put("/jobs/1/detail").set("Cookie", authCookie("42")).send(patch);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(detail);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/1/detail"),
      expect.objectContaining({
        method: "PUT",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
        body: JSON.stringify(patch),
      }),
    );
  });

  it("proxies core's 404 through unchanged when the job isn't the caller's", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(404, { error: "job not found" }));

    const res = await request(app)
      .put("/jobs/1/detail")
      .set("Cookie", authCookie())
      .send({ jdText: "x", interviewNotes: "" });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /jobs/:id/stages", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).delete("/jobs/1/stages?enteredAt=2026-08-26T20:24:30Z");
    expect(res.status).toBe(401);
  });

  it("forwards enteredAt and stage to core and returns the remaining stage events", async () => {
    const events = [{ stage: "RESUME_CHECK", enteredAt: "2026-08-25T23:00:00Z", note: null }];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, events));

    const res = await request(app)
      .delete("/jobs/1/stages?enteredAt=2026-08-26T20:24:30Z&stage=INTERVIEW_STAGE")
      .set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(events);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/1/stages?enteredAt=2026-08-26T20%3A24%3A30Z&stage=INTERVIEW_STAGE"),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
      }),
    );
  });

  it("returns 400 for a malformed enteredAt without calling core", async () => {
    const res = await request(app)
      .delete("/jobs/1/stages?enteredAt=yesterday&stage=RESUME_CHECK")
      .set("Cookie", authCookie());
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 when enteredAt is missing entirely", async () => {
    const res = await request(app).delete("/jobs/1/stages?stage=RESUME_CHECK").set("Cookie", authCookie());
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns 400 for a stage that isn't an enum name, without calling core", async () => {
    const res = await request(app)
      .delete("/jobs/1/stages?enteredAt=2026-08-26T20:24:30Z&stage=../../admin")
      .set("Cookie", authCookie());
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("POST /jobs/:id/links", () => {
  const links = [{ jobId: 2, company: "Globex", role: "Security Engineer II", relation: "REPLACED_BY" }];

  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).post("/jobs/1/links").send({ targetJobId: 2, relation: "REPLACED_BY" });
    expect(res.status).toBe(401);
  });

  it("forwards the link body and returns the job's links", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, links));

    const body = { targetJobId: 2, relation: "REPLACED_BY" };
    const res = await request(app).post("/jobs/1/links").set("Cookie", authCookie("42")).send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(links);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/1/links"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
        body: JSON.stringify(body),
      }),
    );
  });

  it("proxies core's 400 through unchanged when the target is the job itself", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      fakeCoreResponse(400, { error: "a job cannot be linked to itself" }),
    );

    const res = await request(app)
      .post("/jobs/1/links")
      .set("Cookie", authCookie())
      .send({ targetJobId: 1, relation: "RELATED" });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: "a job cannot be linked to itself" });
  });
});

describe("DELETE /jobs/:id/links/:targetId", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).delete("/jobs/1/links/2");
    expect(res.status).toBe(401);
  });

  it("forwards the caller's id and returns the remaining links", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, []));

    const res = await request(app).delete("/jobs/1/links/2").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/jobs/1/links/2"),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
      }),
    );
  });

  it("returns 400 for a non-numeric target id without calling core", async () => {
    const res = await request(app).delete("/jobs/1/links/..%2Fadmin").set("Cookie", authCookie());
    expect(res.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("GET /jobs/:id/resume-recommendation", () => {
  const rulesRecommendation = {
    recommendedVariantId: "base",
    recommendedDisplayName: "Base",
    scores: { base: 5, adobe: 0 },
    reason: "matched: backend, team lead",
    variants: [
      { id: "base", displayName: "Base", blurb: "General backend." },
      { id: "adobe", displayName: "Adobe Developer Productivity", blurb: "CI/CD and platform." },
    ],
  };
  const jobDetail = { jobId: 1, jdText: "we are hiring a backend engineer", interviewNotes: "" };

  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).get("/jobs/1/resume-recommendation");
    expect(res.status).toBe(401);
  });

  it("returns both the rules-based and AI recommendations together", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeCoreResponse(200, rulesRecommendation))
      .mockResolvedValueOnce(fakeCoreResponse(200, jobDetail))
      .mockResolvedValueOnce(fakeCoreResponse(200, { variantId: "base", reason: "Emphasizes backend and team lead." }));

    const res = await request(app).get("/jobs/1/resume-recommendation").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      rules: {
        recommendedVariantId: "base",
        recommendedDisplayName: "Base",
        scores: { base: 5, adobe: 0 },
        reason: "matched: backend, team lead",
      },
      ai: {
        status: "ok",
        recommendedVariantId: "base",
        recommendedDisplayName: "Base",
        reason: "Emphasizes backend and team lead.",
      },
    });
  });

  it("reports the AI side as not_configured without failing the rules side", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeCoreResponse(200, rulesRecommendation))
      .mockResolvedValueOnce(fakeCoreResponse(200, jobDetail))
      .mockResolvedValueOnce(fakeCoreResponse(503, { error: "not_configured" }));

    const res = await request(app).get("/jobs/1/resume-recommendation").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body.ai).toEqual({ status: "not_configured" });
    expect(res.body.rules.recommendedVariantId).toBe("base");
  });

  it("proxies core's 404 through unchanged when the job isn't the caller's", async () => {
    (fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(fakeCoreResponse(404, { error: "job not found" }))
      .mockResolvedValueOnce(fakeCoreResponse(404, { error: "job not found" }));

    const res = await request(app).get("/jobs/1/resume-recommendation").set("Cookie", authCookie());

    expect(res.status).toBe(404);
  });
});
