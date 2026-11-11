import { useEffect, useState, type ReactNode } from "react";
import { useOutletContext } from "react-router-dom";
import type { SeasonOutlet } from "../routes/ProtectedRoute";
import { getReminderSettings, type ReminderSettings } from "../api/remindersApi";
import { getAccount, type Account } from "../api/accountApi";
import AccountSettings from "../components/profile/AccountSettings";
import PasswordSettings from "../components/profile/PasswordSettings";
import NotificationSettings from "../components/profile/NotificationSettings";
import DataSettings from "../components/profile/DataSettings";

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="rounded-lg border border-neutral-200 p-5 dark:border-neutral-800">
      <h2 id={id} className="mb-3 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

// Each form mounts only once its data loads, so its state is never null.
function Loaded<T>({ data, error, render }: { data: T | null; error: string | null; render: (data: T) => ReactNode }) {
  if (data) return <>{render(data)}</>;
  if (error) return <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  return <p className="text-sm">Loading…</p>;
}

export default function ProfilePage() {
  // Not onSeasonChanged: that remounts every page, this one with it, and would lose the restore's result.
  const { onSeasonsRenamed } = useOutletContext<SeasonOutlet>();
  const [account, setAccount] = useState<Account | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [settings, setSettings] = useState<ReminderSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  useEffect(() => {
    let ignore = false;
    getAccount()
      .then(loaded => { if (!ignore) setAccount(loaded); })
      .catch(err => { if (!ignore) setAccountError(err instanceof Error ? err.message : "failed to load your account"); });
    getReminderSettings()
      .then(loaded => { if (!ignore) setSettings(loaded); })
      .catch(err => { if (!ignore) setSettingsError(err instanceof Error ? err.message : "failed to load notification settings"); });
    return () => { ignore = true; };
  }, []);

  return (
    <div className="min-w-0 p-6">
      <div className="mb-6 flex items-center justify-center">
        <h1 className="text-2xl font-semibold">Profile</h1>
      </div>

      <div className="mx-auto max-w-xl space-y-6">
        <Section id="account-heading" title="Account">
          <Loaded data={account} error={accountError} render={loaded => <AccountSettings initial={loaded} />} />
        </Section>
        <Section id="password-heading" title="Password">
          <PasswordSettings />
        </Section>
        <Section id="notifications-heading" title="Notifications">
          <Loaded data={settings} error={settingsError} render={loaded => <NotificationSettings initial={loaded} />} />
        </Section>
        <Section id="data-heading" title="Your data">
          <DataSettings onSeasonsChanged={onSeasonsRenamed} />
        </Section>
      </div>
    </div>
  );
}
