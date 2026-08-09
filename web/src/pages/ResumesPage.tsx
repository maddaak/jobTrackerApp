import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  uploadResume,
  summarizeResume,
  setCustomResumeSummary,
  listResumes,
  deleteResume,
  type ResumeSummary,
} from "../api/resumesApi";
import { useAuth } from "../context/AuthContext";

const STATUS_LABEL: Record<string, string> = {
  ok: "",
  not_configured: "Add an Anthropic API key to enable AI summaries",
  unavailable: "AI summary failed — try again or write your own below",
};

const SUMMARY_DISCLAIMER =
  "This summary is used to match your resume against job postings — generate it automatically with AI, or write your own for full control.";

// accept only constrains the browse picker; a drag-drop can hand us any file, so validate here.
const ALLOWED_EXTENSIONS = [".pdf", ".docx", ".txt"];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export default function ResumesPage() {
  const { aiConfigured } = useAuth();
  const [searchParams] = useSearchParams();
  const onboarding = searchParams.get("onboarding") === "1";

  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customDrafts, setCustomDrafts] = useState<Record<string, string>>({});
  const [summarizingId, setSummarizingId] = useState<string | null>(null);
  const [savingCustomId, setSavingCustomId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Tag each refresh so a slower earlier load can't overwrite newer data.
  const reqId = useRef(0);

  useEffect(() => {
    // Ignore a load that resolves after unmount.
    let ignore = false;
    listResumes()
      .then(loaded => { if (!ignore) setResumes(loaded); })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load resumes"); });
    return () => { ignore = true; };
  }, []);

  async function refresh() {
    const id = ++reqId.current;
    try {
      const loaded = await listResumes();
      if (id === reqId.current) setResumes(loaded);
    } catch (err) {
      if (id === reqId.current) setError(err instanceof Error ? err.message : "failed to load resumes");
    }
  }

  async function handleFile(file: File) {
    const hasAllowedExtension = ALLOWED_EXTENSIONS.some(ext => file.name.toLowerCase().endsWith(ext));
    if (!hasAllowedExtension) {
      setError("Unsupported file type — upload a PDF, DOCX, or TXT.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("File is too large — the maximum is 10 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      await uploadResume(file);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to upload resume");
    } finally {
      setUploading(false);
    }
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  async function handleSummarizeWithAi(id: string) {
    setSummarizingId(id);
    setError(null);
    try {
      await summarizeResume(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to summarize resume");
    } finally {
      setSummarizingId(null);
    }
  }

  async function handleSaveCustomSummary(id: string) {
    const summary = customDrafts[id]?.trim();
    if (!summary) return;
    setSavingCustomId(id);
    setError(null);
    try {
      await setCustomResumeSummary(id, summary);
      setCustomDrafts(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save custom summary");
    } finally {
      setSavingCustomId(null);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this resume permanently?")) return;
    try {
      await deleteResume(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to delete resume");
    }
  }

  return (
    <div className="min-w-0 p-6">
      <div className="mb-6 flex items-center justify-center">
        <h1 className="text-2xl font-semibold">Resumes</h1>
      </div>

      {onboarding && (
        <div className="mb-6 flex items-center justify-between rounded border border-blue-300 bg-blue-50 px-4 py-3 text-sm dark:border-blue-800 dark:bg-blue-950/30">
          <span>
            {resumes.length > 0
              ? "Resume(s) uploaded — you'll get job-fit recommendations when adding jobs."
              : "Upload your resume(s) to get job-fit recommendations when adding jobs."}
          </span>
          <Link to="/" className="ml-4 shrink-0 text-blue-600 hover:underline dark:text-blue-400">
            {resumes.length > 0 ? "Continue → Home" : "Skip for now → Home"}
          </Link>
        </div>
      )}

      {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div
        role="button"
        tabIndex={0}
        aria-label="Upload resume"
        onClick={() => !uploading && fileInputRef.current?.click()}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!uploading) fileInputRef.current?.click();
          }
        }}
        onDragOver={e => {
          e.preventDefault();
          if (!uploading) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`mb-6 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
          dragging
            ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
            : "border-neutral-300 bg-neutral-50 hover:border-blue-400 hover:bg-blue-50/50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-blue-600 dark:hover:bg-blue-950/20"
        } ${uploading ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,text/plain"
          aria-label="Resume file"
          className="hidden"
          onChange={handleInputChange}
        />
        {uploading ? (
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Uploading…</p>
        ) : (
          <>
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Drag and drop your resume here, or <span className="text-blue-600 dark:text-blue-400">click to browse</span>
            </p>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">PDF, DOCX, or TXT</p>
          </>
        )}
      </div>

      <div className="space-y-2">
        {resumes.length === 0 && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">No resumes uploaded yet.</p>
        )}
        {resumes.map(resume => (
          <div
            key={resume.id}
            className="flex items-start justify-between rounded border border-neutral-300 bg-white p-3 text-sm dark:border-neutral-700 dark:bg-neutral-900"
          >
            <div className="min-w-0">
              <div className="font-medium">{resume.fileName}</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">
                Uploaded {new Date(resume.uploadedAt).toLocaleDateString()}
              </div>
              {resume.analysisStatus === "ok" && resume.summary ? (
                <p className="mt-1 text-neutral-700 dark:text-neutral-300">
                  {resume.summary}{" "}
                  <span className="text-xs text-neutral-400 dark:text-neutral-500">
                    ({resume.analysisSource === "ai" ? "AI-generated" : "Custom"})
                  </span>
                </p>
              ) : (
                <div className="mt-2 rounded border border-dashed border-neutral-300 p-2 dark:border-neutral-700">
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {!aiConfigured
                      ? "AI summaries are disabled: no Anthropic API key found. Write your own below."
                      : resume.analysisStatus === "not_configured"
                        ? STATUS_LABEL.not_configured
                        : resume.analysisStatus === "unavailable"
                          ? STATUS_LABEL.unavailable
                          : SUMMARY_DISCLAIMER}
                  </p>
                  {/* No key or not_configured: custom-summary is the only real option. */}
                  {aiConfigured && resume.analysisStatus !== "not_configured" && (
                    <button
                      type="button"
                      onClick={() => handleSummarizeWithAi(resume.id)}
                      disabled={summarizingId === resume.id}
                      className="mt-2 rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {summarizingId === resume.id
                        ? "Summarizing…"
                        : resume.analysisStatus === "unavailable"
                          ? "Retry with AI"
                          : "Summarize with AI"}
                    </button>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <textarea
                      aria-label={`Custom summary for ${resume.fileName}`}
                      rows={2}
                      placeholder="Or write your own summary"
                      value={customDrafts[resume.id] ?? ""}
                      onChange={e => setCustomDrafts(prev => ({ ...prev, [resume.id]: e.target.value }))}
                      className="w-full rounded border border-neutral-300 bg-white px-2 py-1 text-xs text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveCustomSummary(resume.id)}
                      disabled={!customDrafts[resume.id]?.trim() || savingCustomId === resume.id}
                      className="shrink-0 rounded border border-neutral-300 px-3 py-1 text-xs font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800"
                    >
                      {savingCustomId === resume.id ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleDelete(resume.id)}
              className="ml-4 shrink-0 text-red-600 hover:underline dark:text-red-400"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
