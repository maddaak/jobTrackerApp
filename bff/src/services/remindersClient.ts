import { callCore } from "./coreClient.js";

export interface ReminderSettingsRequestData {
  emailEnabled: boolean;
  email: string | null;
  timeZone: string;
  digest: boolean;
  digestHour: number;
  interviewSoon: boolean;
  offerDeadline: boolean;
  followUp: boolean;
}

export interface ReminderSettingsData extends ReminderSettingsRequestData {
  emailConfigured: boolean;
}

export function getReminderSettings(userId: string) {
  return callCore<ReminderSettingsData>("/reminders/settings", { userId });
}

export function saveReminderSettings(userId: string, settings: ReminderSettingsRequestData) {
  return callCore<ReminderSettingsData>("/reminders/settings", { method: "PUT", userId, body: settings });
}

export interface FollowUpData {
  jobId: number;
  company: string;
  role: string;
  contactName: string;
  contactRole: string;
  followUpOn: string;
}

export function getFollowUps(userId: string) {
  return callCore<FollowUpData[]>("/reminders/follow-ups", { userId });
}

export function sendTestReminder(userId: string) {
  return callCore<{ sent: boolean }>("/reminders/test", { method: "POST", userId });
}
