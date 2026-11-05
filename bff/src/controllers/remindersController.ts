import type { Response } from "express";
import { getFollowUps, getReminderSettings, saveReminderSettings, sendTestReminder } from "../services/remindersClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

export async function getSettings(req: AuthedRequest, res: Response) {
  sendUpstream(res, await getReminderSettings(req.userId!));
}

export async function saveSettings(req: AuthedRequest, res: Response) {
  sendUpstream(res, await saveReminderSettings(req.userId!, req.body ?? {}));
}

export async function followUps(req: AuthedRequest, res: Response) {
  sendUpstream(res, await getFollowUps(req.userId!));
}

export async function sendTest(req: AuthedRequest, res: Response) {
  const result = await sendTestReminder(req.userId!);
  // Core's 502/503 here carries the mail server's own reason, which the person needs to fix their SMTP settings.
  const error = (result.data as { error?: unknown } | undefined)?.error;
  if ((result.status === 502 || result.status === 503) && typeof error === "string") {
    res.status(result.status).json({ error });
    return;
  }
  sendUpstream(res, result);
}
