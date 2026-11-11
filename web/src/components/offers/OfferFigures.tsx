import type { Offer } from "../../api/offersApi";
import { formatDay } from "../../localDate";

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const sharePrice = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

const DAY_MS = 24 * 60 * 60 * 1000;

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

// What an offer pays and when, read-only: the Offers page card and the Insights offers list both show it.
export default function OfferFigures({ offer }: { offer: Offer }) {
  const pending = offer.outcome === "ACTIVE";
  const accepted = offer.outcome === "OFFER_ACCEPTED";
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
      {(offer.startDate || (accepted && offer.acceptedOn)) && (
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          {accepted && offer.acceptedOn && `Accepted ${formatDay(offer.acceptedOn)}`}
          {accepted && offer.acceptedOn && offer.startDate && " · "}
          {offer.startDate && `Starts ${formatDay(offer.startDate)}`}
        </p>
      )}
      {offer.notes && <p className="mt-2 whitespace-pre-line text-sm">{offer.notes}</p>}
    </>
  );
}
