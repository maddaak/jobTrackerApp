import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMetrics } from "../../src/api/metricsApi";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});

describe("getMetrics", () => {
  it("returns the metrics on success", async () => {
    const metrics = { funnel: [{ stage: "RESUME_CHECK", count: 3 }], sankeyLinks: [] };
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(metrics) });

    const result = await getMetrics();

    expect(fetch).toHaveBeenCalledWith("/metrics");
    expect(result).toEqual(metrics);
  });

  it("throws on failure", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({}) });

    await expect(getMetrics()).rejects.toThrow("failed to load metrics");
  });
});
