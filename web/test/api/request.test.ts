import { describe, it, expect, vi, beforeEach } from "vitest";
import { request, UNAUTHORIZED_EVENT } from "../../src/api/request";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

// A response whose body isn't JSON used to resolve to {} and be returned as T, so a caller
// expecting an array crashed later on .map with an error that pointed nowhere near the cause.
function nonJsonResponse(status: number) {
  return { ok: status < 400, status, json: () => Promise.reject(new SyntaxError("Unexpected token <")) };
}

describe("request", () => {
  it("returns the parsed body on success", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: 1 }]),
    });

    await expect(request("/jobs", "failed")).resolves.toEqual([{ id: 1 }]);
  });

  it("throws instead of resolving to an empty object when a 200 body is not JSON", async () => {
    // Reachable in production: nginx's SPA rewrite serves index.html for an unmatched API path.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(nonJsonResponse(200));

    await expect(request("/jobs", "failed to load jobs")).rejects.toThrow("failed to load jobs");
  });

  it("allows an empty body for DELETE and 204, which legitimately have none", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(nonJsonResponse(200));
    await expect(request("/jobs/1", "failed", { method: "DELETE" })).resolves.toBeUndefined();

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(nonJsonResponse(204));
    await expect(request("/jobs/1", "failed")).resolves.toBeUndefined();
  });

  it("prefers the server's error message and falls back when the error body isn't JSON", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: "the request conflicts with existing data" }),
    });
    await expect(request("/jobs", "failed")).rejects.toThrow("the request conflicts with existing data");

    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(nonJsonResponse(500));
    await expect(request("/jobs", "failed to load jobs")).rejects.toThrow("failed to load jobs");
  });

  it("announces a 401 so the session can be cleared", async () => {
    const listener = vi.fn();
    window.addEventListener(UNAUTHORIZED_EVENT, listener);
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: "unauthorized" }),
    });

    await expect(request("/jobs", "failed")).rejects.toThrow("unauthorized");
    expect(listener).toHaveBeenCalled();
    window.removeEventListener(UNAUTHORIZED_EVENT, listener);
  });
});

// F72: getJobStages asserted the response shape through the cast, so a body missing stageEvents
// put undefined into state and crashed JobDetailModal on .filter one render later.
describe("getJobStages", () => {
  it("fails when the response has no stageEvents rather than returning undefined", async () => {
    const { getJobStages } = await import("../../src/api/jobsApi");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 5 }),
    });

    await expect(getJobStages(5)).rejects.toThrow("failed to load job history");
  });

  it("returns the history when the field is present", async () => {
    const { getJobStages } = await import("../../src/api/jobsApi");
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 5, stageEvents: [{ stage: "RESUME_CHECK", enteredAt: "x", note: null }] }),
    });

    await expect(getJobStages(5)).resolves.toHaveLength(1);
  });
});
