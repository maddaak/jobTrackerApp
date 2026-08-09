import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { newestTag, isNewer, getUpdateStatus, resetUpdateCache } from "../../src/services/updateClient.js";
import { UPDATE_CACHE_MS } from "../../src/config.js";

describe("updateClient", () => {
  beforeEach(() => {
    resetUpdateCache();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function tagsResponse(names: string[]) {
    return { ok: true, json: async () => names.map(name => ({ name })) };
  }

  describe("version comparison", () => {
    it("orders numerically, so v3.10 beats v3.9 where a string sort would not", () => {
      expect(newestTag(["v3.9", "v3.10", "v3.2"])).toBe("v3.10");
    });

    it("ignores tags that are not releases", () => {
      expect(newestTag(["nightly", "v2.2.1", "some-branch-tag"])).toBe("v2.2.1");
      expect(newestTag(["nightly", "wip"])).toBeNull();
    });

    it("treats a missing patch or minor as zero", () => {
      expect(isNewer("v3.0.1", "v3")).toBe(true);
      expect(isNewer("v3", "v3.0.0")).toBe(false);
    });

    it("reports no update when the running build is not a release", () => {
      // A local `docker compose up --build` reports "dev", which no tag is comparable to.
      expect(isNewer("v9.9.9", "dev")).toBe(false);
    });
  });

  describe("getUpdateStatus", () => {
    it("reports an available update from the newest release tag", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(tagsResponse(["v2.2.1", "v3", "v1"]));

      const status = await getUpdateStatus();

      expect(status.latest).toBe("v3");
      // APP_VERSION is unset in tests, so the running build is "dev" and nothing is newer than it.
      expect(status.current).toBe("dev");
      expect(status.updateAvailable).toBe(false);
    });

    it("asks GitHub at most once per cache window", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue(tagsResponse(["v3"]));

      await getUpdateStatus(1_000);
      await getUpdateStatus(1_000 + UPDATE_CACHE_MS - 1);
      expect(fetch).toHaveBeenCalledTimes(1);

      await getUpdateStatus(1_000 + UPDATE_CACHE_MS + 1);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it("fails closed when GitHub is unreachable, rather than surfacing an error", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

      const status = await getUpdateStatus();

      expect(status.latest).toBeNull();
      expect(status.updateAvailable).toBe(false);
    });

    it("caches a failure too, so an outage is not retried on every request", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network down"));

      await getUpdateStatus(1_000);
      await getUpdateStatus(2_000);

      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it("fails closed on a non-ok response and on a body that isn't a tag list", async () => {
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: async () => ({}) });
      expect((await getUpdateStatus(1_000)).latest).toBeNull();

      resetUpdateCache();
      (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ message: "rate limited" }) });
      expect((await getUpdateStatus(2_000)).latest).toBeNull();
    });
  });
});
