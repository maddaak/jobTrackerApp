import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import Modal from "../Modal";
import OfferFigures from "../offers/OfferFigures";
import { listOffers, type Offer } from "../../api/offersApi";

// The offer taken, in full, without leaving Insights. Declined ones are a link to their section instead,
// since there can be many.
export default function AcceptedOfferModal({ onClose }: { onClose: () => void }) {
  const [accepted, setAccepted] = useState<Offer[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    listOffers()
      .then(loaded => { if (!ignore) setAccepted(loaded.filter(offer => offer.outcome === "OFFER_ACCEPTED")); })
      .catch(err => { if (!ignore) setError(err instanceof Error ? err.message : "failed to load offers"); });
    return () => { ignore = true; };
  }, []);

  return (
    <Modal open onClose={onClose} title={accepted && accepted.length > 1 ? "Offers accepted" : "Offer accepted"}>
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {accepted === null && !error && <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>}
      {accepted?.map(offer => (
        <div key={offer.jobId} className="mb-4">
          <p className="font-semibold">{offer.company}</p>
          <p className="mb-2 text-sm text-neutral-600 dark:text-neutral-300">
            {offer.offerTitle && offer.offerTitle !== offer.role ? `${offer.role}, offered as ${offer.offerTitle}` : offer.role}
          </p>
          <OfferFigures offer={offer} />
        </div>
      ))}
      <Link to="/offers#accepted" className="text-sm text-blue-600 hover:underline dark:text-blue-400">Open on the Offers page</Link>
    </Modal>
  );
}
