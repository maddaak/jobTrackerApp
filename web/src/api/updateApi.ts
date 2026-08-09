import { request } from "./request";

export interface UpdateStatus {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}

export const RELEASES_URL = "https://github.com/maddaak/jobTrackerApp/releases";

export async function getUpdateStatus(): Promise<UpdateStatus> {
  return request<UpdateStatus>("/update-status", "failed to check for updates");
}
