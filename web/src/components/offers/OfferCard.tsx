import { useState } from "react";
import MarketCheckPanel from "./MarketCheckPanel";
import AiPanel from "../ai/AiPanel";
import EmailDraftView from "../ai/EmailDraftView";
import { clearJobResult, runNegotiation } from "../../api/aiApi";
import OfferForm from "./OfferForm";
import { OUTCOME_LABELS } from "../../api/jobsApi";
import type { Offer, OfferAssessment, OfferDecision } from "../../api/offersApi";

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

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const sharePrice = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

const DAY_MS = 24 * 60 * 60 * 1000;

const DECISIONS: { value: OfferDecision; label: string }[] = [
  { value: "ACTIVE", label: "Undecided" },
  { value: "OFFER_ACCEPTED", label: "Accepted" },
  { value: "OFFER_DECLINED", label: "Declined" },
];

function amount(value: number | null): string {
  return value === null ? "—" : money.format(value);
}

// Dates arrive as plain yyyy-mm-dd; parsing them as UTC would show the day before west of Greenwich.
function localDate(isoDate: string): Date {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function deadlineLine(isoDate: string): string {
  const date = localDate(isoDate);
  const days = Math.ceil((date.getTime() - Date.now()) / DAY_MS);
  const label = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  if (days < 0) return `Deadline passed (${label})`;
  if (days === 0) return `Decide today (${label})`;
  return `Decide by ${label} · ${days} ${days === 1 ? "day" : "days"} left`;
}

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

  const figures = [
    { label: "Base", value: amount(offer.baseSalary) },
    // A percent with no base yet still says what the letter said.
    {
      label: "Bonus",
      value: offer.bonusPercent === null
        ? amount(offer.annualBonus)
        : `${offer.annualBonus === null ? "" : `${money.format(offer.annualBonus)} `}(${offer.bonusPercent}%)`,
    },
    { label: "Sign-on", value: amount(offer.signOnBonus) },
    // By the year it's paid, so a two-year offset doesn't read as one lump.
    {
      label: "Offset",
      value: offer.signOnByYear.length === 0 ? amount(null) : offer.signOnByYear.map(money.format).join(" + "),
    },
  ];
  const equityShares = offer.equityShares;

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
          <p className="text-2xl font-semibold tabular-nums">
            {amount(offer.averagePerYear)}
            <span className="ml-1 text-sm font-normal text-neutral-500 dark:text-neutral-400">per year</span>
          </p>
          {offer.averagePerYear !== null && offer.averagedOverYears > 1 && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Averaged over {offer.averagedOverYears} years, sign-on and offsets included
              {offer.priceGrowthPercent !== null && `, with the stock growing ${offer.priceGrowthPercent}% a year as the letter assumes`}
            </p>
          )}
          <dl className="mt-2 grid grid-cols-4 gap-2 text-sm">
            {figures.map(figure => (
              <div key={figure.label}>
                <dt className="text-xs text-neutral-500 dark:text-neutral-400">{figure.label}</dt>
                <dd className="tabular-nums">{figure.value}</dd>
              </div>
            ))}
          </dl>
          {offer.equityGrant !== null && offer.vestingYears !== null && (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              Equity: {equityShares !== null && offer.sharePrice !== null
                ? `${equityShares.toLocaleString()} shares at ${sharePrice.format(offer.sharePrice)} (${money.format(offer.equityGrant)})`
                : money.format(offer.equityGrant)}
              {" "}over {offer.vestingYears} {offer.vestingYears === 1 ? "year" : "years"}
              {offer.vestingSchedule === null
                ? ", vesting evenly"
                : equityShares !== null
                  ? `: ${offer.equitySharesByYear.map(count => count.toLocaleString()).join(" / ")} shares by year`
                  : `: ${offer.equityByYear.map(money.format).join(" / ")} by year`}
            </p>
          )}
          {/* Only when the years differ: that's when the average above hides what each year pays. */}
          {(new Set(offer.compByYear).size > 1 || offer.projectedCompByYear.length > 0) && (
            <div className="mt-2 text-sm">
              <p className="text-xs text-neutral-500 dark:text-neutral-400">Pay by year, with vesting, offsets, and sign-on</p>
              <ol aria-label="Pay by year at today's price" className="mt-1 flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
                {offer.compByYear.map((pay, index) => (
                  <li key={index}><span className="text-neutral-500 dark:text-neutral-400">Year {index + 1}</span> {money.format(pay)}</li>
                ))}
              </ol>
              {offer.projectedCompByYear.length > 0 && (
                <>
                  <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                    If the stock grows {offer.priceGrowthPercent}% a year, as the letter assumes (not guaranteed)
                  </p>
                  <ol aria-label="Pay by year with the assumed growth" className="mt-1 flex flex-wrap gap-x-4 gap-y-1 tabular-nums text-neutral-600 dark:text-neutral-300">
                    {offer.projectedCompByYear.map((pay, index) => (
                      <li key={index}><span className="text-neutral-500 dark:text-neutral-400">Year {index + 1}</span> {money.format(pay)}</li>
                    ))}
                  </ol>
                </>
              )}
            </div>
          )}
          {pending && offer.decisionDeadline && (
            <p className="mt-2 text-sm font-medium text-amber-700 dark:text-amber-300">{deadlineLine(offer.decisionDeadline)}</p>
          )}
          {offer.startDate && (
            <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
              Starts {localDate(offer.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            </p>
          )}
          {offer.notes && <p className="mt-2 whitespace-pre-line text-sm">{offer.notes}</p>}

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
                about="A counter-offer to the recruiter, grounded in your market check and any competing offers. Billed by your AI provider."
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
