import { callCore } from "./coreClient.js";
import type { Location, Outcome } from "./jobsClient.js";
import type { MarketCheckData } from "./scraperAnalysisClient.js";
import type { AiResultData } from "./aiResultsClient.js";

export interface OfferData {
  jobId: number;
  company: string;
  role: string;
  location: Location | null;
  city: string | null;
  outcome: Outcome;
  // The title offered when it differs from the posting's role, such as after a downlevel.
  offerTitle: string | null;
  baseSalary: number | null;
  bonusAmount: number | null;
  bonusPercent: number | null;
  // In dollars; for a grant given in shares, equityShares times sharePrice.
  equityGrant: number | null;
  equityShares: number | null;
  sharePrice: number | null;
  // The yearly share-price rise the letter assumes; null when none.
  priceGrowthPercent: number | null;
  vestingYears: number | null;
  vestingSchedule: number[] | null;
  // The letter's own share count each year, when entered.
  vestedShares: number[] | null;
  // The sign-on, paid once in year 1, and the offset beside each vesting year, as entered.
  signOnBonus: number | null;
  signOnByYear: number[];
  // Both together by the year each is paid; what the AI is given.
  signOnPaidByYear: number[];
  // Worked out by core from the fields above.
  annualBonus: number | null;
  equityByYear: number[];
  equitySharesByYear: number[];
  equityProjectedByYear: number[];
  equityPerYear: number | null;
  // All pay, sign-on included, at the letter's growth over averagedOverYears, the same span for every offer.
  averagePerYear: number | null;
  averagedOverYears: number;
  compByYear: number[];
  // compByYear with each vest at the assumed growth; empty when none is assumed.
  projectedCompByYear: number[];
  startDate: string | null;
  decisionDeadline: string | null;
  notes: string | null;
  marketCheck: (MarketCheckData & { checkedAt: string }) | null;
  marketCheckStale: boolean;
  negotiationDraft: AiResultData | null;
}

export interface OfferRequestData {
  offerTitle: string | null;
  baseSalary: number | null;
  bonusAmount: number | null;
  bonusPercent: number | null;
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

// The AI prices the title offered; the posting's goes alongside only when they differ, so a downlevel shows.
export function offeredRoles(offer: OfferData): { role: string; postedRole: string } {
  const offered = offer.offerTitle?.trim();
  if (!offered || offered === offer.role) return { role: offer.role, postedRole: "" };
  return { role: offered, postedRole: offer.role };
}

// Words the AI can search with, rather than the app's own codes: "Hybrid, Toronto".
const LOCATION_TERMS: Record<Location, string> = {
  REMOTE: "Remote",
  ON_SITE: "On-site",
  HYBRID: "Hybrid",
};

export function offerPlace(offer: OfferData): string {
  return [offer.location ? LOCATION_TERMS[offer.location] : "", offer.city ?? ""].filter(Boolean).join(", ");
}

export function listOffers(userId: string) {
  return callCore<OfferData[]>("/offers", { userId });
}

export function saveOffer(userId: string, jobId: string, offer: OfferRequestData) {
  return callCore<OfferData>(`/jobs/${encodeURIComponent(jobId)}/offer`, {
    method: "PUT", userId, body: offer,
  });
}

export function clearMarketCheck(userId: string, jobId: string) {
  return callCore<OfferData>(`/jobs/${encodeURIComponent(jobId)}/offer/market-check`, { method: "DELETE", userId });
}

export function saveMarketCheck(userId: string, jobId: string, check: MarketCheckData) {
  return callCore<OfferData>(`/jobs/${encodeURIComponent(jobId)}/offer/market-check`, {
    method: "PUT", userId, body: check,
  });
}
