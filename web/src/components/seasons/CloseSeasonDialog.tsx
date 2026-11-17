import { useEffect, useState, type FormEvent } from "react";
import Modal from "../Modal";
import { closeSeason, type Season } from "../../api/seasonsApi";
import { getSeasonSummary, type SeasonSummary } from "../../api/metricsApi";
import { formatDay } from "../../localDate";

const linkClass = "text-blue-600 hover:underline dark:text-blue-400";

export interface CloseSeasonDialogProps {
  season: Season;
  onClose: () => void;
  onClosed: (saved: Season) => void;
  // Shows this season's Offers page at that section, where offers are accepted and declined.
  onOpenOffers: (section: "accepted" | "pending") => void;
}

type Offers = SeasonSummary["offers"];

function StillOpen({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
      {count} {count === 1 ? "application is" : "applications are"} still open or paused. Closing marks{" "}
      {count === 1 ? "it" : "them"} Withdrawn, since the hunt is over.
    </p>
  );
}

// What the hunt came to, as the Offers page decided it. Nothing is chosen here, so there's one place to decide.
function Result({ offers, onOpenOffers }: { offers: Offers; onOpenOffers: CloseSeasonDialogProps["onOpenOffers"] }) {
  const undecided = offers.filter(offer => offer.outcome === "ACTIVE");
  const accepted = offers.find(offer => offer.outcome === "OFFER_ACCEPTED");
  const declined = offers.filter(offer => offer.outcome === "OFFER_DECLINED").length;

  if (undecided.length > 0) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-700 dark:bg-amber-950">
        <p>
          {undecided.map(offer => `${offer.company}, ${offer.role}`).join("; ")}{" "}
          {undecided.length === 1 ? "is" : "are"} still undecided. Accept or decline on the Offers page, then close the
          season.
        </p>
        <button type="button" onClick={() => onOpenOffers("pending")} className={`mt-2 ${linkClass}`}>
          Go to the Offers page
        </button>
      </div>
    );
  }
  if (accepted) {
    return (
      <div className="text-sm">
        <p>
          You accepted <span className="font-medium">{accepted.company}</span>, {accepted.role}
          {accepted.acceptedOn && <> on {formatDay(accepted.acceptedOn)}</>}.
        </p>
        <p className="text-neutral-600 dark:text-neutral-300">
          {accepted.startDate ? `Starting ${formatDay(accepted.startDate)}.` : "No start date yet."}
          {declined > 0 && ` You declined ${declined} other ${declined === 1 ? "offer" : "offers"}.`}
        </p>
        <button type="button" onClick={() => onOpenOffers("accepted")} className={`mt-1 ${linkClass}`}>
          Change on the Offers page
        </button>
      </div>
    );
  }
  return (
    <p className="text-sm">
      {declined > 0
        ? `You didn't accept an offer: you declined ${declined === 1 ? "the one" : `all ${declined}`} you got.`
        : "This hunt ended without an offer."}
    </p>
  );
}

export default function CloseSeasonDialog({ season, onClose, onClosed, onOpenOffers }: CloseSeasonDialogProps) {
  const [offers, setOffers] = useState<Offers | null>(null);
  const [stillOpen, setStillOpen] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    getSeasonSummary(season.id)
      .then(summary => {
        if (ignore) return;
        setOffers(summary.offers);
        setStillOpen(summary.openApplications);
      })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load the offers"); });
    return () => { ignore = true; };
  }, [season.id]);

  const undecided = offers?.some(offer => offer.outcome === "ACTIVE") ?? false;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onClosed(await closeSeason(season.id));
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
        <section aria-labelledby="close-result">
          <h3 id="close-result" className="mb-1 text-sm font-medium">Job search result</h3>
          {offers === null
            ? <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
            : <><Result offers={offers} onOpenOffers={onOpenOffers} />{!undecided && <StillOpen count={stillOpen} />}</>}
        </section>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800">
            Cancel
          </button>
          <button type="submit" disabled={saving || offers === null || undecided}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50">
            {saving ? "Closing…" : "Close season"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
