import { listOffers, offeredRoles, offerPlace, saveMarketCheck, type OfferData } from "./offersClient.js";
import { checkMarket } from "./scraperAnalysisClient.js";
import { dataOrError, isServiceError, serviceError, type ServiceError } from "./outcome.js";

export type MarketCheckOutcome =
  | { status: "ok"; offer: OfferData }
  | { status: "not_configured" | "unavailable" }
  | ServiceError;

// Saved with the offer, so the page shows it again without paying for another search.
export async function checkOfferMarket(userId: string, jobId: string): Promise<MarketCheckOutcome> {
  const offers = dataOrError(await listOffers(userId));
  if (isServiceError(offers)) return offers;
  const offer = offers.find(candidate => String(candidate.jobId) === jobId);
  if (!offer) {
    return serviceError(404, "no offer for this job");
  }

  const result = await checkMarket({
    company: offer.company,
    ...offeredRoles(offer),
    location: offerPlace(offer),
    baseSalary: offer.baseSalary,
    annualBonus: offer.annualBonus,
    equityPerYear: offer.equityPerYear,
    signOnTotal: offer.signOnPaidByYear.length ? offer.signOnPaidByYear.reduce((sum, amount) => sum + amount, 0) : null,
  });
  if (result.status === "rejected") {
    return serviceError(result.httpStatus, result.error);
  }
  if (result.status !== "ok") {
    return { status: result.status };
  }

  const saved = dataOrError(await saveMarketCheck(userId, jobId, result.data));
  if (isServiceError(saved)) return saved;
  return { status: "ok", offer: saved };
}
