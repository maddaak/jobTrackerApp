import type { Response } from "express";
import {
  changePassword,
  countSampleJobs,
  endOtherSessions,
  exportBackup,
  getAccount,
  loadSample,
  removeSample,
  restoreBackup,
  updateAccount,
} from "../services/accountClient.js";
import type { AuthResponseData } from "../services/authClient.js";
import type { UpstreamResult } from "../services/upstream.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";
import { setAuthCookie } from "./authController.js";

export async function sampleJobs(req: AuthedRequest, res: Response) {
  sendUpstream(res, await countSampleJobs(req.userId!));
}

export async function addSample(req: AuthedRequest, res: Response) {
  sendUpstream(res, await loadSample(req.userId!));
}

export async function deleteSample(req: AuthedRequest, res: Response) {
  sendUpstream(res, await removeSample(req.userId!));
}

export async function get(req: AuthedRequest, res: Response) {
  sendUpstream(res, await getAccount(req.userId!));
}

export async function update(req: AuthedRequest, res: Response) {
  const { name, email, currentPassword } = req.body ?? {};
  sendUpstream(res, await updateAccount(req.userId!, { name, email, currentPassword }));
}

export async function exportData(req: AuthedRequest, res: Response) {
  const result = await exportBackup(req.userId!);
  if (!result.file) {
    res.status(result.status).json({ error: result.status >= 500 ? "internal error" : "failed to export your data" });
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", result.file.contentDisposition ?? "attachment; filename=\"job-tracker-backup.json\"");
  res.send(result.file.body);
}

export async function restoreData(req: AuthedRequest, res: Response) {
  if (!req.file) {
    res.status(400).json({ error: "choose a backup file to restore" });
    return;
  }
  sendUpstream(res, await restoreBackup(req.userId!, req.file.buffer));
}

export async function updatePassword(req: AuthedRequest, res: Response) {
  const { currentPassword, newPassword } = req.body ?? {};
  keepSignedIn(res, await changePassword(req.userId!, currentPassword, newPassword));
}

export async function signOutOtherDevices(req: AuthedRequest, res: Response) {
  keepSignedIn(res, await endOtherSessions(req.userId!));
}

// Core ended every session, this one included, and sent a token for this one to carry on with.
function keepSignedIn(res: Response, result: UpstreamResult<AuthResponseData>) {
  if (!result.ok) {
    sendUpstream(res, result);
    return;
  }
  if (!result.data?.token) {
    res.status(502).json({ error: "internal error" });
    return;
  }
  setAuthCookie(res, result.data.token);
  res.json({ status: "ok" });
}
