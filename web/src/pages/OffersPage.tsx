import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { toUpdateJobInput, updateJob } from "../api/jobsApi";
import {
  OFFER_SECTIONS, acceptOffer, lastComparison, listOffers, type Offer, type OfferDecision, type SavedComparison,
} from "../api/offersApi";
import JobDetailModal from "../components/JobDetailModal";
import OfferCard from "../components/offers/OfferCard";
import AcceptOfferDialog from "../components/offers/AcceptOfferDialog";
import OfferComparisonPanel from "../components/offers/OfferComparisonPanel";
import { useAuth } from "../hooks/useAuth";
import { useJobs } from "../hooks/useJobs";

export default function OffersPage() {
  const { aiConfigured } = useAuth();
  // The job list supplies the full record that accepting or declining PATCHes back.
  const { jobs, error, setError, refresh: refreshJobs } = useJobs();
  // Null until loaded: a failed load must not read as "No offers yet".
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [comparison, setComparison] = useState<SavedComparison | null>(null);
  const [openJobId, setOpenJobId] = useState<number | null>(null);
  // Accepting asks the day accepted and the start date first.
  const [accepting, setAccepting] = useState<Offer | null>(null);

  // The saved comparison comes back with each load, so an edit or decision is reflected in whether it's stale.
  const loadOffers = useCallback(async () => {
    try {
      const [loaded, saved] = await Promise.all([
        listOffers(),
        aiConfigured ? lastComparison().catch(() => null) : Promise.resolve(null),
      ]);
      setOffers(loaded);
      setComparison(saved);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to load offers");
    }
  }, [setError, aiConfigured]);

  useEffect(() => { loadOffers(); }, [loadOffers]);

  // A link such as Insights' "2 declined" lands on its section, which only exists once the offers load.
  const { hash } = useLocation();
  const loaded = offers !== null;
  useEffect(() => {
    if (loaded && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [loaded, hash]);

  async function refreshAll() {
    await Promise.all([loadOffers(), refreshJobs()]);
  }

  // No confirm: a decision is a choice in a picker and can be set back to Undecided.
  async function decide(offer: Offer, outcome: OfferDecision) {
    if (outcome === "OFFER_ACCEPTED") {
      setAccepting(offer);
      return;
    }
    const job = jobs.find(candidate => candidate.id === offer.jobId);
    // Deciding PATCHes the whole job back, so without it there's nothing safe to send.
    if (!job) {
      setError("This job hasn't loaded yet. Try again in a moment.");
      return;
    }
    setError(null);
    try {
      await updateJob(job.id, { ...toUpdateJobInput(job), outcome });
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to update offer");
    }
  }

  // A paused offer is in no section; it lives on the Paused page until resumed.
  const sections = OFFER_SECTIONS.map(section => ({
    ...section, offers: (offers ?? []).filter(offer => offer.outcome === section.outcome),
  }));
  const pending = sections.find(section => section.outcome === "ACTIVE")!.offers;
  // A stale verdict describes offers that have since changed, so the cards don't wear it.
  const current = comparison && !comparison.stale ? comparison : null;
  const assessments = current?.assessments ?? [];
  const recommendedJobId = current?.recommendedJobId ?? null;
  const openJob = jobs.find(job => job.id === openJobId) ?? null;

  function renderCards(list: Offer[]) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        {list.map(offer => (
          <OfferCard
            key={offer.jobId}
            offer={offer}
            assessment={assessments.find(assessment => assessment.jobId === offer.jobId) ?? null}
            recommended={offer.jobId === recommendedJobId}
            aiConfigured={aiConfigured}
            onChanged={loadOffers}
            onAiResultChanged={loadOffers}
            onDecide={decide}
            onOpenDetails={setOpenJobId}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold">Offers</h1>
      {error && <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {offers === null ? (
        !error && <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
      ) : offers.length === 0 ? (
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No offers yet. Drag a card to "Got an offer" on the board when one comes in.
        </p>
      ) : (
        <>
          {sections.every(section => section.offers.length === 0) && (
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              Every offer is paused. Resume one from the Paused page to see it here.
            </p>
          )}
          {sections.filter(section => section.offers.length > 0).map(section => (
            <section key={section.outcome} id={section.anchor} className="mb-8 scroll-mt-6">
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {section.title}
              </h2>
              {/* The comparison weighs only undecided offers, so it sits with them. */}
              {aiConfigured && section.outcome === "ACTIVE" && (
                <OfferComparisonPanel
                  // Remounted when a saved comparison arrives, so its priorities fill the box.
                  key={comparison?.createdAt ?? "none"}
                  pendingCount={pending.length}
                  comparison={comparison}
                  onCompared={setComparison}
                />
              )}
              {renderCards(section.offers)}
            </section>
          ))}
        </>
      )}

      <JobDetailModal job={openJob} allJobs={jobs} onClose={() => setOpenJobId(null)} onSaved={refreshAll} />
      {accepting && (
        <AcceptOfferDialog
          label={`${accepting.company}, ${accepting.offerTitle ?? accepting.role}`}
          acceptedOn={accepting.acceptedOn}
          startDate={accepting.startDate}
          onAccept={async days => {
            await acceptOffer(accepting.jobId, days);
            setAccepting(null);
            await refreshAll();
          }}
          onCancel={() => setAccepting(null)}
        />
      )}
    </div>
  );
}
