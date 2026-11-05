import { getAccountAi, saveAccountAi } from "./aiResultsClient.js";
import { seasonShown } from "./seasonsClient.js";
import { listOffers, offeredRoles, offerPlace, type OfferData } from "./offersClient.js";
import { compareOffers, type CompareOfferInput } from "./scraperAnalysisClient.js";
import { dataOrError, isServiceError, serviceError, type ServiceError } from "./outcome.js";

export interface OfferAssessment {
  jobId: number;
  pros: string[];
  cons: string[];
  negotiationPoints: string[];
}

export interface Comparison {
  status: "ok";
  recommendedJobId: number | null;
  summary: string;
  assessments: OfferAssessment[];
  priorities: string;
  createdAt: string;
  // The offers have changed since: one was edited, decided, or added.
  stale: boolean;
}

export type ComparisonOutcome = Comparison | { status: "not_configured" | "unavailable" } | ServiceError;

// What the AI is told about each undecided offer. Only undecided ones: once an offer is accepted or declined
// there is nothing left to weigh it against.
function comparisonInput(offers: OfferData[]): CompareOfferInput[] {
  return offers.filter(offer => offer.outcome === "ACTIVE").map(offer => ({
    id: String(offer.jobId),
    company: offer.company,
    ...offeredRoles(offer),
    location: offerPlace(offer),
    baseSalary: offer.baseSalary,
    annualBonus: offer.annualBonus,
    equityPerYear: offer.equityPerYear,
    equityByYear: offer.equityByYear,
    signOnByYear: offer.signOnPaidByYear,
    averagePerYear: offer.averagePerYear,
    averagedOverYears: offer.averagedOverYears,
    compByYear: offer.compByYear,
    priceGrowthPercent: offer.priceGrowthPercent,
    projectedCompByYear: offer.projectedCompByYear,
    startDate: offer.startDate ?? "",
    decisionDeadline: offer.decisionDeadline ?? "",
    notes: offer.notes ?? "",
  }));
}

// Kept as text beside the answer: a string comes back from storage exactly as written, so any change to
// what the AI was told shows as a difference.
const basisOf = (input: CompareOfferInput[]) => JSON.stringify(input);

// Weighs the caller's undecided offers against their priorities, and saves the answer for the season shown
// so seeing it again costs nothing.
export async function compareUndecidedOffers(userId: string, priorities: string): Promise<ComparisonOutcome> {
  const season = await seasonShown(userId);
  if (isServiceError(season)) return season;
  const offers = dataOrError(await listOffers(userId));
  if (isServiceError(offers)) return offers;
  const input = comparisonInput(offers);
  if (input.length === 0) {
    return serviceError(409, "no undecided offers to compare");
  }

  const result = await compareOffers(priorities, input);
  if (result.status === "rejected") {
    return serviceError(result.httpStatus, result.error);
  }
  if (result.status !== "ok") {
    return { status: result.status };
  }

  // The scraper drops ids it was never sent, so every id parses back to a pending job. The list is
  // still read defensively: a missing one used to 500 here.
  const answer = {
    recommendedJobId: result.data.recommendedOfferId ? Number(result.data.recommendedOfferId) : null,
    summary: result.data.summary,
    assessments: (result.data.offers ?? []).map(assessment => ({
      jobId: Number(assessment.id),
      pros: assessment.pros ?? [],
      cons: assessment.cons ?? [],
      negotiationPoints: assessment.negotiationPoints ?? [],
    })),
    priorities,
  };
  const saved = dataOrError(await saveAccountAi(userId, "offer-comparison", { ...answer, basis: basisOf(input) }, { season }));
  if (isServiceError(saved)) return saved;
  return { status: "ok", ...answer, createdAt: saved.createdAt, stale: false };
}

// The last comparison for the season shown, if any, and whether the offers have changed since it was made.
export async function savedComparison(userId: string): Promise<{ comparison: Comparison | null } | ServiceError> {
  const saved = await getAccountAi(userId, "offer-comparison");
  if (saved.status === 404) return { comparison: null };
  const result = dataOrError(saved);
  if (isServiceError(result)) return result;
  const offers = dataOrError(await listOffers(userId));
  if (isServiceError(offers)) return offers;

  const { basis, ...answer } = result.content as Omit<Comparison, "status" | "createdAt" | "stale"> & { basis: string };
  return {
    comparison: {
      status: "ok",
      ...answer,
      createdAt: result.createdAt,
      stale: basis !== basisOf(comparisonInput(offers)),
    },
  };
}
