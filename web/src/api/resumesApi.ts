export type AnalysisStatus = "pending" | "ok" | "not_configured" | "unavailable";

export interface ResumeSummary {
  id: string;
  fileName: string;
  uploadedAt: string;
  analysisStatus: AnalysisStatus;
  summary: string | null;
  skills: string[] | null;
  seniority: string | null;
  roles: string[] | null;
}

export type MatchResult =
  | { status: "ok"; fileName: string; recommendation: "APPLY" | "DO_NOT_APPLY"; reasoning: string }
  | { status: "no_resumes" }
  | { status: "not_configured" }
  | { status: "unavailable" };

export async function uploadResume(file: File): Promise<ResumeSummary> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch("/resumes", { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "failed to upload resume");
  }
  return data;
}

export async function listResumes(): Promise<ResumeSummary[]> {
  const res = await fetch("/resumes");
  if (!res.ok) {
    throw new Error("failed to load resumes");
  }
  return res.json();
}

export async function deleteResume(id: string): Promise<void> {
  const res = await fetch(`/resumes/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? "failed to delete resume");
  }
}

export async function matchResumeToJob(jobDescriptionText: string): Promise<MatchResult> {
  const res = await fetch("/resumes/match", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobDescriptionText }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? "failed to get recommendation");
  }
  return data;
}
