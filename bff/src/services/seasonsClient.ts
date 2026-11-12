import { callCore } from "./coreClient.js";
import { dataOrError, isServiceError, type ServiceError } from "./outcome.js";

export interface SeasonData {
  id: number;
  name: string;
  createdAt: string;
  jobCount: number;
  active: boolean;
  // Null while the season runs. The offer taken outlives a reopen, to fill the next close.
  closedAt: string | null;
  acceptedJobId: number | null;
  // From the season's applications; null with none yet.
  firstApplied: string | null;
  lastApplied: string | null;
}

export function listSeasons(userId: string) {
  return callCore<SeasonData[]>("/seasons", { userId });
}

// Read before a long AI run, so its answer is saved for the season it was made from even if the view
// changes meanwhile. "all" when every season is showing.
export async function seasonShown(userId: string): Promise<string | ServiceError> {
  const seasons = dataOrError(await listSeasons(userId));
  if (isServiceError(seasons)) return seasons;
  return String(seasons.find(season => season.active)?.id ?? "all");
}

export function createSeason(userId: string, name: unknown) {
  return callCore<SeasonData>("/seasons", { method: "POST", userId, body: { name } });
}

export function renameSeason(userId: string, seasonId: string, name: unknown) {
  return callCore<SeasonData>(`/seasons/${encodeURIComponent(seasonId)}`, { method: "PATCH", userId, body: { name } });
}

export function deleteSeason(userId: string, seasonId: string) {
  return callCore<void>(`/seasons/${encodeURIComponent(seasonId)}`, { method: "DELETE", userId });
}

// Null shows every season at once.
export function viewSeason(userId: string, seasonId: unknown) {
  return callCore<void>("/seasons/active", { method: "PUT", userId, body: { seasonId: seasonId ?? null } });
}

// Core checks the job is an offer in this season and marks it accepted; a hunt can end without one. Its days
// are set on the offer itself.
export function closeSeason(userId: string, seasonId: string, body: { acceptedJobId?: unknown }) {
  return callCore<SeasonData>(`/seasons/${encodeURIComponent(seasonId)}/close`, {
    method: "POST", userId, body: { acceptedJobId: body.acceptedJobId ?? null },
  });
}

export function reopenSeason(userId: string, seasonId: string) {
  return callCore<SeasonData>(`/seasons/${encodeURIComponent(seasonId)}/reopen`, { method: "POST", userId });
}

export function moveJobToSeason(userId: string, seasonId: string, jobId: string) {
  return callCore<void>(`/seasons/${encodeURIComponent(seasonId)}/jobs/${encodeURIComponent(jobId)}`,
    { method: "PUT", userId });
}
