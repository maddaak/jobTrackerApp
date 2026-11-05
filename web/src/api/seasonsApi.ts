import { request } from "./request";

// One job hunt. The board, calendar, offers, and Insights show the active one, or every season at once.
export interface Season {
  id: number;
  name: string;
  createdAt: string;
  jobCount: number;
  active: boolean;
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

export async function moveJobToSeason(seasonId: number, jobId: number): Promise<void> {
  await request<void>(`/seasons/${seasonId}/jobs/${jobId}`, "failed to move the job", { method: "PUT" });
}
