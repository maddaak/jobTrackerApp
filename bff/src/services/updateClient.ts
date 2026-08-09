import {
  APP_VERSION,
  UPDATE_CACHE_MS,
  UPDATE_CHECK,
  UPDATE_REPO,
  UPDATE_TIMEOUT_MS,
} from "../config.js";

export interface UpdateStatus {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}

// Only "vN", "vN.N" and "vN.N.N" tags are releases; anything else on the repo is ignored.
const RELEASE_TAG = /^v(\d+)(?:\.(\d+))?(?:\.(\d+))?$/;

function parseVersion(tag: string): number[] | null {
  const match = RELEASE_TAG.exec(tag.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

// Returns > 0 when a is newer. Compares numerically, so v3.10 beats v3.9 where a string sort would not.
function compareVersions(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export function newestTag(tags: string[]): string | null {
  let best: { tag: string; parts: number[] } | null = null;
  for (const tag of tags) {
    const parts = parseVersion(tag);
    if (!parts) continue;
    if (!best || compareVersions(parts, best.parts) > 0) {
      best = { tag, parts };
    }
  }
  return best?.tag ?? null;
}

export function isNewer(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  // A local build reports "dev", which no release is comparable to.
  if (!latestParts || !currentParts) return false;
  return compareVersions(latestParts, currentParts) > 0;
}

let cached: { at: number; latest: string | null } | null = null;

// Exported for tests; a module-level cache would otherwise leak between them.
export function resetUpdateCache(): void {
  cached = null;
}

// Fails closed: any problem reaching GitHub reports "no update known", never an error to the user.
// The check is a convenience, so it must not make the app look broken when it can't run.
async function fetchLatestTag(now: number): Promise<string | null> {
  if (cached && now - cached.at < UPDATE_CACHE_MS) {
    return cached.latest;
  }
  let latest: string | null = null;
  try {
    const res = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/tags?per_page=100`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "jobtracker-update-check" },
      signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS),
    });
    if (res.ok) {
      const tags = (await res.json()) as unknown;
      if (Array.isArray(tags)) {
        latest = newestTag(tags.map(t => (t as { name?: unknown })?.name).filter(n => typeof n === "string"));
      }
    }
  } catch {
    latest = null;
  }
  // Cached either way, so an outage doesn't mean retrying on every request.
  cached = { at: now, latest };
  return latest;
}

export async function getUpdateStatus(now: number = Date.now()): Promise<UpdateStatus> {
  if (!UPDATE_CHECK) {
    return { current: APP_VERSION, latest: null, updateAvailable: false };
  }
  const latest = await fetchLatestTag(now);
  return {
    current: APP_VERSION,
    latest,
    updateAvailable: latest !== null && isNewer(latest, APP_VERSION),
  };
}
