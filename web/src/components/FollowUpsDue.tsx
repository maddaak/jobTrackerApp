import { useEffect, useState } from "react";
import { getFollowUps, type FollowUp } from "../api/remindersApi";
import { CONTACT_ROLE_LABELS } from "../api/jobsApi";

export interface FollowUpsDueProps {
  // Bumped by the parent after any save, since "Spoke today" in a job's dialog settles one.
  refreshSignal: number;
  onOpenJob: (jobId: number) => void;
}

function dueText(date: string): string {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// The people you meant to get back to by today. Works without email, which is off until someone sets it up.
export default function FollowUpsDue({ refreshSignal, onOpenJob }: FollowUpsDueProps) {
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);

  useEffect(() => {
    let ignore = false;
    getFollowUps()
      .then(loaded => { if (!ignore && Array.isArray(loaded)) setFollowUps(loaded); })
      // A reminder, not the board itself: if the check fails, the board still works.
      .catch(() => {});
    return () => { ignore = true; };
  }, [refreshSignal]);

  if (followUps.length === 0) return null;

  return (
    <section aria-label="Follow-ups due" className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-800 dark:bg-amber-950/30">
      <p className="mb-1 font-medium text-amber-900 dark:text-amber-200">
        {followUps.length === 1 ? "1 follow-up due" : `${followUps.length} follow-ups due`}
      </p>
      <ul className="space-y-0.5">
        {followUps.map(followUp => (
          <li key={`${followUp.jobId}:${followUp.contactName}`}>
            <button type="button" onClick={() => onOpenJob(followUp.jobId)} className="text-left hover:underline">
              {followUp.contactName} ({CONTACT_ROLE_LABELS[followUp.contactRole]}) at {followUp.company}, {followUp.role}
            </button>
            <span className="text-amber-800 dark:text-amber-300"> · by {dueText(followUp.followUpOn)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
