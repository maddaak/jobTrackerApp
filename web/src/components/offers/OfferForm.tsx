import { useState, type FormEvent } from "react";
import { saveOffer, type Offer, type OfferInput } from "../../api/offersApi";

export interface OfferFormProps {
  offer: Offer;
  onSaved: () => void;
  onCancel: () => void;
}

type BonusUnit = "amount" | "percent";
type EquityUnit = "dollars" | "shares";

const BONUS_UNITS: { value: BonusUnit; label: string }[] = [
  { value: "amount", label: "Dollar amount" },
  { value: "percent", label: "% of base" },
];

// Most public-company letters give a share count; a startup's often gives a dollar value.
const EQUITY_UNITS: { value: EquityUnit; label: string }[] = [
  { value: "shares", label: "Shares" },
  { value: "dollars", label: "Dollar value" },
];

// How the letter states an amount, as two buttons beside its label.
function UnitToggle<T extends string>({ label, units, value, onChange }: {
  label: string;
  units: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex overflow-hidden rounded border border-neutral-300 text-xs dark:border-neutral-600">
      {units.map(unit => (
        <button
          key={unit.value}
          type="button"
          aria-pressed={value === unit.value}
          onClick={() => onChange(unit.value)}
          className={value === unit.value
            ? "bg-blue-600 px-2 py-0.5 font-medium text-white"
            : "px-2 py-0.5 text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"}
        >
          {unit.label}
        </button>
      ))}
    </div>
  );
}

const inputClass =
  "w-full rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 dark:border-neutral-600 dark:bg-neutral-900 dark:text-neutral-100";
const fieldLabelClass = "mb-1 block text-xs text-neutral-500 dark:text-neutral-400";
const suffixClass = "pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-neutral-500";

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const DEFAULT_VESTING_YEARS = 4;
const MAX_VESTING_YEARS = 10;
const YEAR_OPTIONS = Array.from({ length: MAX_VESTING_YEARS }, (_, i) => i + 1);

// Blank stays blank: an amount not known yet must not reach the comparison as zero.
function toNumber(value: string): number | null {
  return value.trim() === "" ? null : Number(value);
}

// To one decimal, with the last year taking the rounding so the schedule always adds up to 100.
function evenSchedule(years: number): string[] {
  const share = Math.floor(1000 / years) / 10;
  const last = Math.round((100 - share * (years - 1)) * 10) / 10;
  return [...Array(years - 1).fill(String(share)), String(last)];
}

// As core splits a grant: whole parts first, then the units left go to the largest fractions, earlier years
// on a tie. Rounding each year alone can vest more shares than the grant holds.
function splitWhole(total: number, percents: number[]): number[] {
  const exact = percents.map(percent => total * percent / 100);
  const whole = exact.map(Math.floor);
  const left = Math.round(exact.reduce((sum, amount) => sum + amount, 0)) - whole.reduce((sum, count) => sum + count, 0);
  exact.map((amount, year) => ({ year, fraction: Math.round((amount - whole[year]) * 1e6) }))
    .sort((a, b) => b.fraction - a.fraction || a.year - b.year)
    .slice(0, Math.max(0, left))
    .forEach(({ year }) => whole[year]++);
  return whole;
}

export default function OfferForm({ offer, onSaved, onCancel }: OfferFormProps) {
  const [offerTitle, setOfferTitle] = useState(offer.offerTitle ?? "");
  const [baseSalary, setBaseSalary] = useState(offer.baseSalary?.toString() ?? "");
  const [bonusUnit, setBonusUnit] = useState<BonusUnit>(offer.bonusPercent !== null ? "percent" : "amount");
  const [bonus, setBonus] = useState((offer.bonusPercent ?? offer.bonusAmount)?.toString() ?? "");
  const [signOnOnce, setSignOnOnce] = useState(offer.signOnBonus?.toString() ?? "");
  // Cash paid beside each vesting year to offset a thin vest, as a back-loaded grant's letter gives it.
  const [offsets, setOffsets] = useState(offer.signOnByYear.map(String));
  // A new offer starts on shares, how most letters state it; a saved dollar grant stays in dollars.
  const [equityUnit, setEquityUnit] = useState<EquityUnit>(
    offer.equityGrant !== null && offer.equityShares === null ? "dollars" : "shares");
  const [equityGrant, setEquityGrant] = useState(offer.equityShares === null ? offer.equityGrant?.toString() ?? "" : "");
  const [equityShares, setEquityShares] = useState(offer.equityShares?.toString() ?? "");
  const [sharePrice, setSharePrice] = useState(offer.sharePrice?.toString() ?? "");
  const [priceGrowth, setPriceGrowth] = useState(offer.priceGrowthPercent?.toString() ?? "");
  const [vestingYears, setVestingYears] = useState(offer.vestingYears ?? DEFAULT_VESTING_YEARS);
  const [customSchedule, setCustomSchedule] = useState(offer.vestingSchedule !== null);
  const [schedule, setSchedule] = useState(
    offer.vestingSchedule?.map(String) ?? evenSchedule(offer.vestingYears ?? DEFAULT_VESTING_YEARS));
  // The letter's own share count per year, optional: blank years use the schedule's split.
  const [letterShares, setLetterShares] = useState(offer.vestedShares?.map(String) ?? []);
  const [startDate, setStartDate] = useState(offer.startDate ?? "");
  const [decisionDeadline, setDecisionDeadline] = useState(offer.decisionDeadline ?? "");
  const [notes, setNotes] = useState(offer.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Counts typed for one number of years don't fit another, so they're cleared with the schedule.
  function changeVestingYears(years: number) {
    setVestingYears(years);
    setSchedule(evenSchedule(years));
    setLetterShares([]);
  }

  function changeLetterShares(year: number, value: string) {
    setLetterShares(current => Array.from({ length: Math.max(current.length, year + 1) }, (_, i) =>
      i === year ? value : current[i] ?? ""));
  }

  function changeOffset(year: number, value: string) {
    setOffsets(current => Array.from({ length: Math.max(current.length, year + 1) }, (_, i) =>
      i === year ? value : current[i] ?? ""));
  }

  function changePercent(year: number, value: string) {
    setSchedule(current => current.map((percent, i) => (i === year ? value : percent)));
  }

  // A live preview so the person needn't do the arithmetic; core works out the saved figures itself.
  const base = toNumber(baseSalary);
  const bonusValue = toNumber(bonus);
  const bonusDollars = bonusUnit === "percent" && bonusValue !== null && base !== null ? Math.round(base * bonusValue / 100) : null;
  const shareCount = equityUnit === "shares" ? toNumber(equityShares) : null;
  const price = equityUnit === "shares" ? toNumber(sharePrice) : null;
  const grant = equityUnit === "dollars"
    ? toNumber(equityGrant)
    : shareCount !== null && price !== null ? Math.round(shareCount * price) : null;
  const hasEquity = equityUnit === "dollars" ? grant !== null : shareCount !== null;
  const percents = customSchedule ? schedule.map(percent => Number(percent) || 0) : Array(vestingYears).fill(100 / vestingYears);
  const scheduleTotal = Math.round(percents.reduce((sum, percent) => sum + percent, 0) * 10) / 10;
  const splitShares = shareCount === null ? [] : splitWhole(shareCount, percents);
  const letterShareBoxes = splitShares.map((_, year) => letterShares[year] ?? "");
  const sharesByYear = splitShares.map((count, year) => toNumber(letterShareBoxes[year]) ?? count);
  const lettersCounts = letterShareBoxes.some(count => count.trim() !== "");
  const sharesVested = sharesByYear.reduce((sum, count) => sum + count, 0);
  // Only whole shares vest, so each year is valued share by share, as the letter's table does.
  const equityByYear = price !== null && sharesByYear.length
    ? sharesByYear.map(count => Math.round(count * price))
    : grant === null ? [] : splitWhole(grant, percents);
  // An offset box per vesting year; none without equity, where there's no vest to offset.
  const offsetBoxes = hasEquity ? Array.from({ length: vestingYears }, (_, year) => offsets[year] ?? "") : [];
  const offsetByYear = offsetBoxes.map(amount => toNumber(amount) ?? 0);
  const once = toNumber(signOnOnce);
  // The same sum core makes, so the preview matches the card once saved. The sign-on is paid in year 1.
  const recurring = (base ?? 0) + (bonusUnit === "percent" ? bonusDollars ?? 0 : bonusValue ?? 0);
  const payByYear = Array.from({ length: Math.max(1, offsetBoxes.length) }, (_, year) =>
    recurring + (equityByYear[year] ?? 0) + (offsetByYear[year] ?? 0) + (year === 0 ? once ?? 0 : 0));
  const showPay = base !== null || bonusValue !== null || grant !== null || once !== null;
  // The letter's assumed price rise, compounding: year 2 at 1.15 times today's price, year 3 at 1.15 squared.
  const growth = toNumber(priceGrowth);
  // Letters quote each year's assumed share price to the cent, then multiply.
  const projectedByYear = !growth ? []
    : price !== null && sharesByYear.length
      ? sharesByYear.map((count, year) => Math.round(count * (Math.round(price * (1 + growth / 100) ** year * 100) / 100)))
      : equityByYear.map((amount, year) => Math.round(amount * (1 + growth / 100) ** year));
  const projectedPay = projectedByYear.length
    ? payByYear.map((pay, year) => pay - (equityByYear[year] ?? 0) + (projectedByYear[year] ?? 0))
    : [];

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const input: OfferInput = {
      offerTitle: offerTitle.trim() || null,
      baseSalary: base,
      bonusAmount: bonusUnit === "amount" ? bonusValue : null,
      bonusPercent: bonusUnit === "percent" ? bonusValue : null,
      equityGrant: equityUnit === "dollars" ? grant : null,
      equityShares: shareCount,
      sharePrice: price,
      priceGrowthPercent: hasEquity ? growth : null,
      vestingYears: hasEquity ? vestingYears : null,
      vestingSchedule: hasEquity && customSchedule ? schedule.map(Number) : null,
      vestedShares: lettersCounts ? sharesByYear : null,
      signOnBonus: once,
      signOnByYear: offsetBoxes.some(amount => amount.trim() !== "") ? offsetByYear : null,
      startDate: startDate || null,
      decisionDeadline: decisionDeadline || null,
      notes: notes.trim() || null,
    };
    try {
      await saveOffer(offer.jobId, input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed to save offer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="text-sm">
        <label htmlFor="offer-title" className="mb-1 block font-medium">Offered title</label>
        <input
          id="offer-title"
          className={inputClass}
          placeholder={offer.role}
          value={offerTitle}
          onChange={e => setOfferTitle(e.target.value)}
        />
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Only if it differs from the posting, such as a different level. The market check prices this title.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Base salary</span>
          <input type="number" min={0} step={1} className={inputClass} value={baseSalary} onChange={e => setBaseSalary(e.target.value)} />
        </label>
        <div className="text-sm">
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor="offer-bonus" className="font-medium">Annual bonus</label>
            <UnitToggle label="Bonus as" units={BONUS_UNITS} value={bonusUnit} onChange={setBonusUnit} />
          </div>
          <div className="relative">
            {bonusUnit === "amount" && (
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-neutral-500">$</span>
            )}
            <input
              id="offer-bonus"
              type="number"
              min={0}
              step="any"
              className={`${inputClass} ${bonusUnit === "amount" ? "pl-5" : "pr-7"}`}
              value={bonus}
              onChange={e => setBonus(e.target.value)}
            />
            {bonusUnit === "percent" && (
              <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-neutral-500">%</span>
            )}
          </div>
          {bonusDollars !== null && (
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{money.format(bonusDollars)} a year</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="text-sm">
          <label htmlFor="offer-sign-on" className="mb-1 block font-medium">Sign-on bonus</label>
          <input id="offer-sign-on" type="number" min={0} step={1} className={inputClass} value={signOnOnce} onChange={e => setSignOnOnce(e.target.value)} />
        </div>
      </div>

      <fieldset className="space-y-3 rounded border border-neutral-200 p-3 dark:border-neutral-800">
        <legend className="px-1 text-sm font-medium">Equity</legend>
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="font-medium">Grant given as</span>
          <UnitToggle label="Grant given as" units={EQUITY_UNITS} value={equityUnit} onChange={setEquityUnit} />
        </div>
        {equityUnit === "shares" ? (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="mb-1 block font-medium">Shares</span>
              <input type="number" min={1} step={1} className={inputClass} value={equityShares} onChange={e => setEquityShares(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block font-medium">Share price</span>
              <input type="number" min={0} step="any" className={inputClass} value={sharePrice} onChange={e => setSharePrice(e.target.value)} />
              <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
                {grant !== null ? `${money.format(grant)} in all at this price` : "Today's price, or the one the letter uses"}
              </span>
            </label>
          </div>
        ) : null}
        <div className={`grid gap-3 ${equityUnit === "dollars" ? "grid-cols-3" : "grid-cols-2"}`}>
          {equityUnit === "dollars" && (
            <label className="text-sm">
              <span className="mb-1 block font-medium">Total grant</span>
              <input type="number" min={0} step={1} className={inputClass} value={equityGrant} onChange={e => setEquityGrant(e.target.value)} />
            </label>
          )}
          <label className="text-sm">
            <span className="mb-1 block font-medium">Vests over</span>
            <select className={inputClass} value={vestingYears} onChange={e => changeVestingYears(Number(e.target.value))}>
              {YEAR_OPTIONS.map(years => <option key={years} value={years}>{years} {years === 1 ? "year" : "years"}</option>)}
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Schedule</span>
            <select
              className={inputClass}
              value={customSchedule ? "custom" : "even"}
              onChange={e => setCustomSchedule(e.target.value === "custom")}
            >
              <option value="even">Even</option>
              <option value="custom">Custom</option>
            </select>
          </label>
        </div>
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Expected price growth</span>
          <span className="relative block w-32">
            <input
              type="number"
              min={0}
              max={100}
              step="any"
              placeholder="0"
              className={`${inputClass} pr-12`}
              value={priceGrowth}
              onChange={e => setPriceGrowth(e.target.value)}
            />
            <span aria-hidden className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-neutral-500">% / yr</span>
          </span>
          <span className="mt-1 block text-xs text-neutral-500 dark:text-neutral-400">
            Only if the letter assumes the price rises, such as 15% a year. The average per year uses it.
          </span>
        </label>
        {/* One column per vesting year, read top to bottom: the vest, the sign-on that tops it up, what the year pays. */}
        {hasEquity && (
          <div className="text-sm">
            <div className="grid grid-cols-[repeat(auto-fill,minmax(11rem,1fr))] gap-3">
              {percents.map((percent, index) => (
                <div key={index} className="min-w-0 space-y-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-700">
                  <p className="text-sm font-medium">Year {index + 1}</p>
                  {customSchedule ? (
                    <label className="block">
                      <span className={fieldLabelClass}>Vests</span>
                      <span className="relative block">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step="any"
                          aria-label={`Year ${index + 1} %`}
                          className={`${inputClass} pr-8`}
                          value={schedule[index]}
                          onChange={e => changePercent(index, e.target.value)}
                        />
                        <span aria-hidden className={suffixClass}>%</span>
                      </span>
                    </label>
                  ) : (
                    <div>
                      <span className={fieldLabelClass}>Vests</span>
                      <p>{Math.round(percent * 10) / 10}%</p>
                    </div>
                  )}
                  {splitShares.length > 0 && (
                    <label className="block">
                      <span className={fieldLabelClass}>Shares vesting</span>
                      <input
                        type="number"
                        min={0}
                        step={1}
                        placeholder={String(splitShares[index])}
                        aria-label={`Shares, year ${index + 1}`}
                        className={inputClass}
                        value={letterShareBoxes[index]}
                        onChange={e => changeLetterShares(index, e.target.value)}
                      />
                    </label>
                  )}
                  <label className="block">
                    <span className={fieldLabelClass}>Offset cash</span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      placeholder="0"
                      aria-label={`Offset, year ${index + 1}`}
                      className={inputClass}
                      value={offsetBoxes[index]}
                      onChange={e => changeOffset(index, e.target.value)}
                    />
                  </label>
                  <dl className="space-y-1 whitespace-nowrap border-t border-neutral-200 pt-2 text-xs tabular-nums dark:border-neutral-700">
                    {equityByYear.length > 0 && (
                      <div className="flex justify-between gap-2 text-neutral-500 dark:text-neutral-400">
                        <dt>Stock value</dt>
                        <dd>{money.format(equityByYear[index])}</dd>
                      </div>
                    )}
                    {showPay && (
                      <div className="flex justify-between gap-2 font-medium text-neutral-900 dark:text-neutral-100">
                        <dt>Total pay</dt>
                        <dd>{money.format(payByYear[index])}</dd>
                      </div>
                    )}
                    {projectedPay.length > 0 && (
                      <div className="flex justify-between gap-2 text-neutral-500 dark:text-neutral-400">
                        <dt>With {growth}% growth</dt>
                        <dd>{money.format(projectedPay[index])}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ))}
            </div>
            {customSchedule && (
              <p className={`mt-1 text-xs ${scheduleTotal === 100 ? "text-neutral-500 dark:text-neutral-400" : "text-red-600 dark:text-red-400"}`}>
                Adds up to {scheduleTotal}%{scheduleTotal === 100 ? "" : ", needs 100%"}
              </p>
            )}
            {lettersCounts && sharesVested !== shareCount && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                Shares by year add up to {sharesVested.toLocaleString()}, not the grant's {shareCount?.toLocaleString()}
              </p>
            )}
            <p className="mt-3 text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
              {splitShares.length > 0 && "Shares vesting: worked out from the %; type the letter's count if it differs. "}
              Offset cash: what a letter pays in a year to make up for a thin vest. Total pay is base, bonus, stock
              value, and offset cash, plus the sign-on bonus in year 1.
            </p>
          </div>
        )}
      </fieldset>

      {/* With equity, each year's column above already shows what it pays. */}
      {showPay && !hasEquity && (
        <div className="rounded bg-neutral-50 p-3 text-sm dark:bg-neutral-800/60">
          <p className="mb-1 font-medium">Pay by year</p>
          <p className="text-xs text-neutral-600 dark:text-neutral-300">
            {payByYear.map((amount, index) => `Year ${index + 1}: ${money.format(amount)}`).join(" · ")}
          </p>
          {projectedPay.length > 0 && (
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-300">
              If the price grows {growth}% a year: {projectedPay.map((amount, index) => `Year ${index + 1}: ${money.format(amount)}`).join(" · ")}
            </p>
          )}
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">Base, bonus, that year's vesting, and that year's sign-on.</p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium">Start date</span>
          <input type="date" className={inputClass} value={startDate} onChange={e => setStartDate(e.target.value)} />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium">Decision deadline</span>
          <input
            type="date"
            className={inputClass}
            value={decisionDeadline}
            onChange={e => setDecisionDeadline(e.target.value)}
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="mb-1 block font-medium">Notes</span>
        <textarea
          rows={3}
          className={inputClass}
          placeholder="Team, growth, remote policy, anything that matters beyond the numbers"
          value={notes}
          onChange={e => setNotes(e.target.value)}
        />
      </label>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Save offer
        </button>
      </div>
    </form>
  );
}
