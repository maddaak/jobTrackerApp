import type { AiResult, EmailDraft } from "./aiApi";
import type { Location, Outcome } from "./jobsApi";
import { request } from "./request";

export interface Offer {
  jobId: number;
  company: string;
  role: string;
  location: Location | null;
  city: string | null;
  outcome: Outcome;
  // The title offered when it differs from the posting's role, such as after a downlevel.
  offerTitle: string | null;
  baseSalary: number | null;
  // One or the other, as the letter states it.
  bonusAmount: number | null;
  bonusPercent: number | null;
  // In dollars; for a grant given in shares, core sets it to equityShares times sharePrice.
  equityGrant: number | null;
  equityShares: number | null;
  sharePrice: number | null;
  // The yearly share-price rise the letter assumes; null when none.
  priceGrowthPercent: number | null;
  vestingYears: number | null;
  // Percent vesting each year; null is even.
  vestingSchedule: number[] | null;
  // The letter's own share count each year, when entered; null uses the schedule's split.
  vestedShares: number[] | null;
  // The sign-on, paid once in year 1, and the offset beside each vesting year, as entered.
  signOnBonus: number | null;
  signOnByYear: number[];
  // Both together, by the year each is paid.
  signOnPaidByYear: number[];
  // Worked out by core: the bonus in dollars, the grant per vesting year (and in shares), and spread evenly.
  annualBonus: number | null;
  equityByYear: number[];
  equitySharesByYear: number[];
  // Each vest at the assumed growth, compounding; empty when none is assumed.
  equityProjectedByYear: number[];
  equityPerYear: number | null;
  // Everything paid over averagedOverYears, sign-on included and at the letter's growth, divided by them.
  // Every offer shares the same span, so this is what they're compared on.
  averagePerYear: number | null;
  averagedOverYears: number;
  // What each year pays: base, bonus, that year's vesting, and that year's sign-on.
  compByYear: number[];
  // The same at the assumed growth; empty when none is assumed.
  projectedCompByYear: number[];
  startDate: string | null;
  decisionDeadline: string | null;
  notes: string | null;
  // The last market check, kept through edits; stale once the title, pay, or location it priced has changed.
  marketCheck: MarketCheck | null;
  marketCheckStale: boolean;
  // The last counter-offer email drafted for it.
  negotiationDraft: AiResult<EmailDraft> | null;
}

// The outcomes an offer can be set to from its card; ACTIVE is still deciding.
export type OfferDecision = "ACTIVE" | "OFFER_ACCEPTED" | "OFFER_DECLINED";

export interface MarketCheck {
  verdict: "below" | "at" | "above" | "unclear";
  typicalLow: number | null;
  typicalHigh: number | null;
  summary: string;
  negotiationPoints: string[];
  // False when the AI provider can't search: the verdict is the model's estimate, with no sources.
  searched: boolean;
  sources: { title: string; url: string }[];
  checkedAt: string;
}

export type MarketCheckOutcome =
  | { status: "ok"; offer: Offer }
  | { status: "not_configured" }
  | { status: "unavailable" };

export interface OfferInput {
  offerTitle: string | null;
  baseSalary: number | null;
  bonusAmount: number | null;
  bonusPercent: number | null;
  // Equity as a dollar grant, or as shares at a price; shares win when both are sent.
  equityGrant: number | null;
  equityShares: number | null;
  sharePrice: number | null;
  priceGrowthPercent: number | null;
  vestingYears: number | null;
  vestingSchedule: number[] | null;
  vestedShares: number[] | null;
  signOnBonus: number | null;
  signOnByYear: number[] | null;
  startDate: string | null;
  decisionDeadline: string | null;
  notes: string | null;
}

export interface OfferAssessment {
  jobId: number;
  pros: string[];
  cons: string[];
  negotiationPoints: string[];
}

// Saved per season, with the priorities it weighed. stale: an offer was edited, decided, or added since.
export interface SavedComparison {
  status: "ok";
  recommendedJobId: number | null;
  summary: string;
  assessments: OfferAssessment[];
  priorities: string;
  createdAt: string;
  stale: boolean;
}

export type OfferComparison = SavedComparison | { status: "not_configured" } | { status: "unavailable" };

export async function listOffers(): Promise<Offer[]> {
  return request<Offer[]>("/offers", "failed to load offers");
}

export async function saveOffer(jobId: number, input: OfferInput): Promise<Offer> {
  return request<Offer>(`/jobs/${jobId}/offer`, "failed to save offer", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function checkMarket(jobId: number): Promise<MarketCheckOutcome> {
  return request<MarketCheckOutcome>(`/jobs/${jobId}/offer/market-check`, "failed to check the market", {
    method: "POST",
  });
}

export async function clearMarketCheck(jobId: number): Promise<Offer> {
  return request<Offer>(`/jobs/${jobId}/offer/market-check`, "failed to remove the market check", {
    method: "DELETE",
  });
}

// The last comparison for the season shown, which costs nothing to see again.
export async function lastComparison(): Promise<SavedComparison | null> {
  return (await request<{ comparison: SavedComparison | null }>("/offers/compare", "failed to load the last comparison"))
    .comparison;
}

export async function compareOffers(priorities: string): Promise<OfferComparison> {
  return request<OfferComparison>("/offers/compare", "failed to compare offers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ priorities }),
  });
}
