import { useState } from "react";
import MarketCheckPanel from "./MarketCheckPanel";
import AiPanel from "../ai/AiPanel";
import EmailDraftView from "../ai/EmailDraftView";
import { clearJobResult, runNegotiation } from "../../api/aiApi";
import OfferForm from "./OfferForm";
import { OUTCOME_LABELS } from "../../api/jobsApi";
import type { Offer, OfferAssessment, OfferDecision } from "../../api/offersApi";
import OfferFigures from "./OfferFigures";

export interface OfferCardProps {
  offer: Offer;
  assessment: OfferAssessment | null;
  recommended: boolean;
  aiConfigured: boolean;
  onChanged: () => void;
  // A market check or a counter-offer draft was saved or removed; unlike an edit, the comparison still holds.
  onAiResultChanged: () => void;
  onDecide: (offer: Offer, outcome: OfferDecision) => void;
  onOpenDetails: (jobId: number) => void;
}

const DECISIONS: { value: OfferDecision; label: string }[] = [
  { value: "ACTIVE", label: "Undecided" },
  { value: "OFFER_ACCEPTED", label: "Accepted" },
  { value: "OFFER_DECLINED", label: "Declined" },
];

function AssessmentList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">{title}</p>
      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm">
        {items.map(item => <li key={item}>{item}</li>)}
      </ul>
    </div>
  );
}

export default function OfferCard({
  offer, assessment, recommended, aiConfigured, onChanged, onAiResultChanged, onDecide, onOpenDetails,
}: OfferCardProps) {
  const [editing, setEditing] = useState(false);
  const pending = offer.outcome === "ACTIVE";

  return (
    <article
      className={[
        "rounded-lg border p-4",
        recommended
          ? "border-green-500 ring-1 ring-green-500 dark:border-green-600 dark:ring-green-600"
          : "border-neutral-200 dark:border-neutral-800",
      ].join(" ")}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate font-semibold" title={offer.company}>{offer.company}</h2>
          <p className="truncate text-sm text-neutral-600 dark:text-neutral-300" title={offer.role}>{offer.role}</p>
          {offer.offerTitle && offer.offerTitle !== offer.role && (
            <p className="truncate text-sm text-neutral-600 dark:text-neutral-300" title={offer.offerTitle}>
              Offered as {offer.offerTitle}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {recommended && (
            <span className="rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800 dark:bg-green-900/40 dark:text-green-200">
              Recommended
            </span>
          )}
          {!pending && (
            <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs font-medium dark:bg-neutral-800">
              {OUTCOME_LABELS[offer.outcome]}
            </span>
          )}
        </div>
      </header>

      {editing ? (
        <OfferForm offer={offer} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />
      ) : (
        <>
          <OfferFigures offer={offer} />

          {assessment && (
            <div className="mt-3 space-y-2 border-t border-neutral-200 pt-3 dark:border-neutral-800">
              <AssessmentList title="Pros" items={assessment.pros} />
              <AssessmentList title="Cons" items={assessment.cons} />
              <AssessmentList title="Worth negotiating" items={assessment.negotiationPoints} />
            </div>
          )}

          {/* A decided offer keeps a check it already has, but there's no reason to start a new one. */}
          {aiConfigured && (pending || offer.marketCheck) && (
            <MarketCheckPanel offer={offer} onChanged={onAiResultChanged} />
          )}

          {aiConfigured && (pending || offer.negotiationDraft) && (
            <div className="mt-3">
              <AiPanel
                title="Counter-offer email"
                about="A counter-offer to the recruiter, from this offer and its notes, your market check while it's current, and your other undecided offers. Billed by your AI provider."
                runLabel="Draft a counter-offer"
                busyLabel="Drafting…"
                result={offer.negotiationDraft ?? null}
                run={() => runNegotiation(offer.jobId)}
                remove={() => clearJobResult(offer.jobId, "negotiation")}
                onChange={onAiResultChanged}
              >
                {content => <EmailDraftView draft={content} />}
              </AiPanel>
            </div>
          )}

          <footer className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <button type="button" onClick={() => setEditing(true)} className="text-blue-600 hover:underline dark:text-blue-400">
              {offer.averagePerYear === null ? "Add details" : "Edit"}
            </button>
            <button type="button" onClick={() => onOpenDetails(offer.jobId)} className="text-blue-600 hover:underline dark:text-blue-400">
              Job details
            </button>
            <label className="ml-auto flex items-center gap-2">
              <span className="text-neutral-500 dark:text-neutral-400">Decision</span>
              <select
                className="rounded border border-neutral-300 bg-white px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-900"
                value={offer.outcome}
                onChange={e => onDecide(offer, e.target.value as OfferDecision)}
              >
                {DECISIONS.map(decision => <option key={decision.value} value={decision.value}>{decision.label}</option>)}
              </select>
            </label>
          </footer>
        </>
      )}
    </article>
  );
}
