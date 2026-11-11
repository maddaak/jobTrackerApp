import { useEffect, useState, type ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { resumeFileProblem, uploadResume } from "../api/resumesApi";
import { getReminderSettings, type ReminderSettings } from "../api/remindersApi";
import { useAuth } from "../hooks/useAuth";
import NotificationSettings from "../components/profile/NotificationSettings";

const STEPS = ["Resumes", "Notifications", "Setup check"] as const;

const buttonClass = "rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50";
const quietButtonClass =
  "rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800";

function ResumeStep() {
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    setError(null);
    setUploading(true);
    try {
      for (const file of files) {
        const problem = resumeFileProblem(file);
        if (problem) {
          setError(`${file.name}: ${problem}`);
          continue;
        }
        await uploadResume(file);
        setUploaded(current => [...current, file.name]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to upload resume");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <p>
        Upload the resumes you send out. With AI set up, adding a job then says which one fits it best. You can add
        more, or write summaries, on the Resumes page any time.
      </p>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Moving from another install? Skip this and use <strong>Restore from a backup</strong> under Profile instead.
      </p>
      <label className={`${quietButtonClass} inline-block cursor-pointer ${uploading ? "pointer-events-none opacity-50" : ""}`}>
        {uploading ? "Uploading…" : "Choose resume files"}
        <input type="file" multiple accept=".pdf,.docx,.txt,text/plain" className="sr-only" onChange={handleFiles} />
      </label>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">PDF, DOCX, or TXT, up to 10 MB each.</p>
      {error && <p role="alert" className="text-red-600 dark:text-red-400">{error}</p>}
      {uploaded.length > 0 && (
        <ul aria-label="Uploaded resumes" className="list-disc pl-5">
          {uploaded.map((name, i) => <li key={`${name}-${i}`}>{name}</li>)}
        </ul>
      )}
    </div>
  );
}

function NotificationStep() {
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    getReminderSettings()
      .then(loaded => { if (!ignore) setSettings(loaded); })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load notification settings"); });
    return () => { ignore = true; };
  }, []);

  if (error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!settings) return <p className="text-sm">Loading…</p>;
  return (
    <div className="space-y-3">
      <p className="text-sm">Reminders by email are off until you turn them on. Your address is filled in from sign-up.</p>
      <NotificationSettings initial={settings} />
    </div>
  );
}

function Check({ ok, title, children }: { ok: boolean; title: string; children: React.ReactNode }) {
  return (
    <li className="rounded border border-neutral-200 p-3 dark:border-neutral-800">
      <p className="font-medium">
        <span aria-hidden className={ok ? "text-green-600" : "text-amber-600"}>{ok ? "✓ " : "○ "}</span>
        {title}: {ok ? "ready" : "not set up"}
      </p>
      {!ok && <div className="mt-2 space-y-2 text-xs">{children}</div>}
    </li>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="overflow-x-auto rounded bg-neutral-100 p-2 dark:bg-neutral-800">{children}</pre>;
}

function SetupStep() {
  const { aiConfigured } = useAuth();
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let ignore = false;
    getReminderSettings()
      .then(loaded => { if (!ignore) setEmailConfigured(loaded.emailConfigured); })
      .catch(() => { if (!ignore) setEmailConfigured(false); });
    return () => { ignore = true; };
  }, []);

  return (
    <div className="space-y-3 text-sm">
      <p>Everything runs on this machine, so these are switched on in the app's <code>.env</code> file, not here.</p>
      <ul className="space-y-2">
        <Check ok={aiConfigured} title="AI features">
          <p>Resume analysis, job-fit recommendations, and offer checks need an AI provider. For Anthropic, add:</p>
          <Code>{"AI_PROVIDER=anthropic\nAI_API_KEY=<your key>"}</Code>
          <p>Or run a free model on this machine with <code>AI_PROVIDER=ollama</code>. Then <code>docker compose up -d scraper</code>.</p>
        </Check>
        <Check ok={emailConfigured === true} title="Email">
          <p>Reminders and emailed password resets need an SMTP account. For Gmail, with an app password:</p>
          <Code>{"SMTP_HOST=smtp.gmail.com\nSMTP_PORT=587\nSMTP_USERNAME=you@gmail.com\nSMTP_PASSWORD=<app password>\nSMTP_FROM=you@gmail.com"}</Code>
          <p>Then <code>docker compose up -d core</code>.</p>
        </Check>
      </ul>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        Registration is now closed to anyone else who can reach this app. Set <code>REGISTRATION_OPEN=true</code> in{" "}
        <code>.env</code> to allow another account.
      </p>
    </div>
  );
}

export default function WelcomePage() {
  const [step, setStep] = useState(0);
  const last = step === STEPS.length - 1;

  return (
    <div className="min-w-0 p-6">
      <div className="mx-auto max-w-xl">
        <h1 className="mb-2 text-center text-2xl font-semibold">Welcome to Job Tracker</h1>
        <ol aria-label="Setup steps" className="mb-6 flex justify-center gap-4 text-sm">
          {STEPS.map((name, i) => (
            <li key={name} aria-current={i === step ? "step" : undefined}
              className={i === step ? "font-semibold text-blue-600 dark:text-blue-400" : "text-neutral-500 dark:text-neutral-400"}>
              {i + 1}. {name}
            </li>
          ))}
        </ol>

        <section aria-label={STEPS[step]} className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
          <h2 className="mb-3 text-lg font-semibold">{STEPS[step]}</h2>
          {step === 0 && <ResumeStep />}
          {step === 1 && <NotificationStep />}
          {step === 2 && <SetupStep />}
        </section>

        <p className="mt-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
          Want to look around first? The board offers a made-up search to try things with, removable in one click.
        </p>

        <div className="mt-4 flex items-center justify-between">
          <button type="button" onClick={() => setStep(step - 1)} disabled={step === 0} className={`${quietButtonClass} disabled:invisible`}>
            Back
          </button>
          {last ? (
            <Link to="/" className={buttonClass}>Go to the board</Link>
          ) : (
            <span className="flex gap-2">
              <Link to="/" className={quietButtonClass}>Skip setup</Link>
              <button type="button" onClick={() => setStep(step + 1)} className={buttonClass}>Next</button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
