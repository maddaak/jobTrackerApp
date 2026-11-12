import { useEffect, useState, type FormEvent } from "react";
import Modal from "../Modal";
import { closeSeason, type Season } from "../../api/seasonsApi";
import { getSeasonSummary, type SeasonSummary } from "../../api/metricsApi";
import { acceptOffer } from "../../api/offersApi";
import { today } from "../../localDate";

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const labelClass = "mb-1 block text-sm font-medium";

export interface CloseSeasonDialogProps {
  season: Season;
  onClose: () => void;
  onClosed: (saved: Season) => void;
}

// Ends a hunt: which offer was taken, if any. Its days start from what the Offers page saved on it, and a
// change here is saved back to the offer, so there's one accepted day and one start date.
export default function CloseSeasonDialog({ season, onClose, onClosed }: CloseSeasonDialogProps) {
  const [offers, setOffers] = useState<SeasonSummary["offers"] | null>(null);
  const [acceptedJobId, setAcceptedJobId] = useState<string>("");
  const [acceptedOn, setAcceptedOn] = useState("");
  const [startDate, setStartDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function choose(jobId: string, from: SeasonSummary["offers"]) {
    const offer = from.find(candidate => String(candidate.jobId) === jobId);
    setAcceptedJobId(jobId);
    setAcceptedOn(offer?.acceptedOn ?? today());
    setStartDate(offer?.startDate ?? "");
  }

  useEffect(() => {
    let ignore = false;
    getSeasonSummary(season.id)
      .then(summary => {
        if (ignore) return;
        setOffers(summary.offers);
        // The offer named last time, or one already marked accepted, is the likely answer.
        const taken = summary.offers.find(offer => offer.jobId === season.acceptedJobId)
          ?? summary.offers.find(offer => offer.accepted);
        if (taken) choose(String(taken.jobId), summary.offers);
      })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load the offers"); });
    return () => { ignore = true; };
  }, [season.id, season.acceptedJobId]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const taken = acceptedJobId ? Number(acceptedJobId) : null;
      if (taken) await acceptOffer(taken, { acceptedOn: acceptedOn || null, startDate: startDate || null });
      onClosed(await closeSeason(season.id, { acceptedJobId: taken }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to close the season");
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Close ${season.name}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Closing makes this season read-only and gives you a summary of the whole hunt. Edit on the Seasons page opens
          it again.
        </p>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <div>
          <label htmlFor="accepted-offer" className={labelClass}>Offer you accepted</label>
          <select id="accepted-offer" className={inputClass} value={acceptedJobId} disabled={offers === null}
            onChange={e => choose(e.target.value, offers ?? [])}>
            <option value="">No offer accepted</option>
            {offers?.map(offer => (
              <option key={offer.jobId} value={offer.jobId}>{offer.company}, {offer.role}</option>
            ))}
          </select>
          {offers?.length === 0 && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">No job in this season reached an offer.</p>
          )}
        </div>
        {acceptedJobId && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="accepted-on" className={labelClass}>Day you accepted</label>
              <input id="accepted-on" type="date" className={inputClass} value={acceptedOn}
                onChange={e => setAcceptedOn(e.target.value)} />
            </div>
            <div>
              <label htmlFor="starts-on" className={labelClass}>Start date</label>
              <input id="starts-on" type="date" className={inputClass} value={startDate}
                onChange={e => setStartDate(e.target.value)} />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800">
            Cancel
          </button>
          <button type="submit" disabled={saving || offers === null}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Closing…" : "Close season"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
