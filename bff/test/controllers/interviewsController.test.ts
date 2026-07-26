import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { app } from "../../src/app.js";

const JWT_SECRET = "test-secret-not-for-production";

function authCookie(userId = "1", username = "alice") {
  const token = jwt.sign({ sub: userId, username }, JWT_SECRET, { expiresIn: "7d" });
  return `token=${token}`;
}

function fakeCoreResponse(status: number, body: unknown) {
  return { ok: status < 400, status, json: () => Promise.resolve(body) };
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("POST /interviews", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).post("/interviews").send({ jobId: 1 });
    expect(res.status).toBe(401);
  });

  it("forwards the caller's id and body to core and returns the created interview", async () => {
    const interview = { stageEventId: 5, jobId: 1, company: "Acme", stage: "INTERVIEW_STAGE" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, interview));

    const body = { jobId: 1, stage: "INTERVIEW_STAGE", interviewDateTime: "2026-08-01T18:00:00Z" };
    const res = await request(app).post("/interviews").set("Cookie", authCookie("42")).send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(interview);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/interviews"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
        body: JSON.stringify(body),
      }),
    );
  });

  it("proxies core's 404 through unchanged when the job isn't the caller's", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(404, { error: "job not found" }));

    const res = await request(app).post("/interviews").set("Cookie", authCookie()).send({ jobId: 1 });

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: "job not found" });
  });

  it("proxies core's 400 (validation failure) through unchanged", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(400, { error: "must not be null" }));

    const res = await request(app).post("/interviews").set("Cookie", authCookie()).send({});

    expect(res.status).toBe(400);
  });
});

describe("PATCH /interviews/:id", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).patch("/interviews/5").send({ interviewDateTime: "2026-08-01T18:00:00Z" });
    expect(res.status).toBe(401);
  });

  it("forwards the caller's id and patch body to core and returns the updated interview", async () => {
    const interview = { stageEventId: 5, interviewType: "BEHAVIOR" };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, interview));

    const patch = { interviewDateTime: "2026-08-05T15:30:00Z", interviewType: "BEHAVIOR",
      meetingLink: null, interviewerName: null, interviewerLinkedInUrl: null };
    const res = await request(app).patch("/interviews/5").set("Cookie", authCookie("42")).send(patch);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(interview);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/interviews/5"),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
        body: JSON.stringify(patch),
      }),
    );
  });

  it("proxies core's 404 through unchanged when the interview isn't the caller's", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(404, { error: "job not found" }));

    const res = await request(app)
      .patch("/interviews/5")
      .set("Cookie", authCookie())
      .send({ interviewDateTime: "2026-08-05T15:30:00Z" });

    expect(res.status).toBe(404);
  });
});

describe("GET /interviews", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).get("/interviews");
    expect(res.status).toBe(401);
  });

  it("returns the caller's interviews", async () => {
    const interviews = [{ stageEventId: 5, jobId: 1, company: "Acme" }];
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, interviews));

    const res = await request(app).get("/interviews").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual(interviews);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/interviews"),
      expect.objectContaining({ headers: expect.objectContaining({ "X-User-Id": "42" }) }),
    );
  });
});

describe("DELETE /interviews/:id", () => {
  it("returns 401 with no auth cookie", async () => {
    const res = await request(app).delete("/interviews/5");
    expect(res.status).toBe(401);
  });

  it("forwards the caller's id to core and returns success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(200, { deleted: true }));

    const res = await request(app).delete("/interviews/5").set("Cookie", authCookie("42"));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ deleted: true });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/interviews/5"),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({ "X-User-Id": "42" }),
      }),
    );
  });

  it("proxies core's 404 through unchanged when the interview isn't the caller's", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(fakeCoreResponse(404, { error: "job not found" }));

    const res = await request(app).delete("/interviews/5").set("Cookie", authCookie());

    expect(res.status).toBe(404);
  });
});
