import type { Response } from "express";
import { acceptOffer, clearMarketCheck, listOffers, saveOffer } from "../services/offersClient.js";
import { compareUndecidedOffers, savedComparison } from "../services/offerComparison.js";
import { checkOfferMarket } from "../services/offerMarketCheck.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendOutcome, sendUpstream } from "../middleware/upstreamResponse.js";

// Long enough for a paragraph of priorities, short enough that it can't crowd out the offers in the prompt.
const MAX_PRIORITIES_CHARS = 2000;

export async function list(req: AuthedRequest, res: Response) {
  sendUpstream(res, await listOffers(req.userId!));
}

export async function save(req: AuthedRequest, res: Response) {
  sendUpstream(res, await saveOffer(req.userId!, req.params.id as string, req.body ?? {}));
}

export async function accept(req: AuthedRequest, res: Response) {
  sendUpstream(res, await acceptOffer(req.userId!, req.params.id as string, req.body ?? {}));
}

export async function compare(req: AuthedRequest, res: Response) {
  const priorities = req.body?.priorities ?? "";
  if (typeof priorities !== "string" || priorities.length > MAX_PRIORITIES_CHARS) {
    res.status(400).json({ error: `priorities must be text of at most ${MAX_PRIORITIES_CHARS} characters` });
    return;
  }
  sendOutcome(res, await compareUndecidedOffers(req.userId!, priorities));
}

export async function lastComparison(req: AuthedRequest, res: Response) {
  sendOutcome(res, await savedComparison(req.userId!));
}

export async function checkMarket(req: AuthedRequest, res: Response) {
  sendOutcome(res, await checkOfferMarket(req.userId!, req.params.id as string));
}

export async function removeMarketCheck(req: AuthedRequest, res: Response) {
  sendUpstream(res, await clearMarketCheck(req.userId!, req.params.id as string));
}
