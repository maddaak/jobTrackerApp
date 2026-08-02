import { describe, it, expect, vi, beforeEach } from "vitest";
import { callCore } from "../../src/services/coreClient.js";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("callCore body handling", () => {
  it("returns undefined data for a 204 empty response without throwing", async () => {
    // Real fetch throws on an empty body when json() is called.
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
    });

    const result = await callCore("/jobs/1", { method: "DELETE" });

    expect(result.ok).toBe(true);
    expect(result.status).toBe(204);
    expect(result.data).toBeUndefined();
  });

  it("returns undefined data for a non-JSON (HTML) body while preserving status", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: () => Promise.reject(new SyntaxError("Unexpected token < in JSON at position 0")),
    });

    const result = await callCore("/jobs");

    expect(result.ok).toBe(false);
    expect(result.status).toBe(502);
    expect(result.data).toBeUndefined();
  });

  it("still parses a valid JSON body", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 1 }),
    });

    const result = await callCore<{ id: number }>("/jobs/1");

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ id: 1 });
  });
});
