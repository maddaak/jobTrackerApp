import { request } from "./request";
import type { ContactRole } from "./jobsApi";

export interface ReminderSettingsInput {
  // Opt-in: off until the person turns it on, and nothing is emailed while it's off.
  emailEnabled: boolean;
  email: string | null;
  // Null until first saved; the page fills in the browser's zone.
  timeZone: string | null;
  digest: boolean;
  digestHour: number;
  interviewSoon: boolean;
  offerDeadline: boolean;
  followUp: boolean;
}

export interface ReminderSettings extends ReminderSettingsInput {
  // Whether the server has SMTP settings; without them nothing can be sent, whatever is saved here.
  emailConfigured: boolean;
}

export async function getReminderSettings(): Promise<ReminderSettings> {
  return request<ReminderSettings>("/reminders/settings", "failed to load reminder settings");
}

export async function saveReminderSettings(input: ReminderSettingsInput): Promise<ReminderSettings> {
  return request<ReminderSettings>("/reminders/settings", "failed to save reminder settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

// A contact whose follow-up day has come, on a job still going in the season shown.
export interface FollowUp {
  jobId: number;
  company: string;
  role: string;
  contactName: string;
  contactRole: ContactRole;
  // yyyy-mm-dd
  followUpOn: string;
}

export async function getFollowUps(): Promise<FollowUp[]> {
  return request<FollowUp[]>("/reminders/follow-ups", "failed to load follow-ups");
}

export async function sendTestReminder(): Promise<void> {
  await request<{ sent: boolean }>("/reminders/test", "failed to send the test email", { method: "POST" });
}
