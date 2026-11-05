import type { Response } from "express";
import {
  createSeason,
  deleteSeason,
  listSeasons,
  moveJobToSeason,
  renameSeason,
  viewSeason,
} from "../services/seasonsClient.js";
import type { AuthedRequest } from "../middleware/requireAuth.js";
import { sendUpstream } from "../middleware/upstreamResponse.js";

export async function list(req: AuthedRequest, res: Response) {
  sendUpstream(res, await listSeasons(req.userId!));
}

export async function create(req: AuthedRequest, res: Response) {
  sendUpstream(res, await createSeason(req.userId!, req.body?.name));
}

export async function rename(req: AuthedRequest, res: Response) {
  sendUpstream(res, await renameSeason(req.userId!, req.params.id as string, req.body?.name));
}

export async function remove(req: AuthedRequest, res: Response) {
  sendUpstream(res, await deleteSeason(req.userId!, req.params.id as string));
}

export async function view(req: AuthedRequest, res: Response) {
  sendUpstream(res, await viewSeason(req.userId!, req.body?.seasonId));
}

export async function moveJob(req: AuthedRequest, res: Response) {
  sendUpstream(res, await moveJobToSeason(req.userId!, req.params.id as string, req.params.jobId as string));
}
