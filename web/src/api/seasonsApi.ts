import { request } from "./request";

// One job hunt. The board, calendar, offers, and Insights show the active one, or every season at once.
export interface Season {
  id: number;
  name: string;
  createdAt: string;
  jobCount: number;
  active: boolean;
  // A closed season is read-only until it's reopened. The offer taken outlives a reopen, to fill the next close.
  closedAt: string | null;
  acceptedJobId: number | null;
  // When the hunt actually ran, from its applications; null with none yet.
  firstApplied: string | null;
  lastApplied: string | null;
}

const MONTH = new Intl.DateTimeFormat(undefined, { month: "short" });

// The year a hunt is filed under in the picker: when it started, or when it was made if nothing's in it yet.
export function seasonYear(season: Season): number {
  return new Date(season.firstApplied ?? season.createdAt).getFullYear();
}

// "Jan–Apr", or "Nov 2025–Feb 2026" across a new year. A closed hunt ends when it closed, an open one at
// its latest application, so an old season left open never claims to run until now.
export function seasonSpan(season: Season): string | null {
  if (!season.firstApplied) return null;
  const start = new Date(season.firstApplied);
  const end = new Date(season.closedAt ?? season.lastApplied ?? season.firstApplied);
  if (start.getFullYear() !== end.getFullYear()) {
    return `${MONTH.format(start)} ${start.getFullYear()}–${MONTH.format(end)} ${end.getFullYear()}`;
  }
  return start.getMonth() === end.getMonth() ? MONTH.format(start) : `${MONTH.format(start)}–${MONTH.format(end)}`;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export async function listSeasons(): Promise<Season[]> {
  return request<Season[]>("/seasons", "failed to load seasons");
}

// Core makes the new season the one shown, since starting a search is when you want to see it.
export async function createSeason(name: string): Promise<Season> {
  return request<Season>("/seasons", "failed to start the season", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
}

export async function renameSeason(id: number, name: string): Promise<Season> {
  return request<Season>(`/seasons/${id}`, "failed to rename the season", {
    method: "PATCH",
    headers: JSON_HEADERS,
    body: JSON.stringify({ name }),
  });
}

export async function deleteSeason(id: number): Promise<void> {
  await request<void>(`/seasons/${id}`, "failed to delete the season", { method: "DELETE" });
}

// Null shows every season together.
export async function viewSeason(id: number | null): Promise<void> {
  await request<void>("/seasons/active", "failed to switch season", {
    method: "PUT",
    headers: JSON_HEADERS,
    body: JSON.stringify({ seasonId: id }),
  });
}

// The offer taken is optional: a hunt can end without one. Its days are saved on the offer, not here.
export async function closeSeason(id: number, ending: { acceptedJobId: number | null }): Promise<Season> {
  return request<Season>(`/seasons/${id}/close`, "failed to close the season", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(ending),
  });
}

export async function reopenSeason(id: number): Promise<Season> {
  return request<Season>(`/seasons/${id}/reopen`, "failed to reopen the season", { method: "POST" });
}

export async function moveJobToSeason(seasonId: number, jobId: number): Promise<void> {
  await request<void>(`/seasons/${seasonId}/jobs/${jobId}`, "failed to move the job", { method: "PUT" });
}
