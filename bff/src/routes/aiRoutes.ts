import { Router } from "express";
import {
  getCompanyBrief,
  getInsights,
  removeCompanyBrief,
  removeInsights,
  removeJobResult,
  removeRoundResult,
  runCompanyBrief,
  runDebrief,
  runFollowUp,
  runInsights,
  runNegotiation,
  runPrep,
  runTailoring,
} from "../controllers/aiController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRouteId, NUMERIC_ID, ROUND_ID } from "../middleware/validateRouteId.js";

// Every POST here is a billed AI call, run only on a click; GETs read what was saved.
const router = Router();

router.use(requireAuth);
router.param("id", validateRouteId(NUMERIC_ID, "invalid job id"));
router.param("roundId", validateRouteId(ROUND_ID, "invalid interview id"));
router.get("/company-brief", getCompanyBrief);
router.post("/company-brief", runCompanyBrief);
router.delete("/company-brief", removeCompanyBrief);
router.get("/insights", getInsights);
router.post("/insights", runInsights);
router.delete("/insights", removeInsights);
router.post("/jobs/:id/follow-up", runFollowUp);
router.post("/jobs/:id/negotiation", runNegotiation);
router.post("/jobs/:id/tailoring", runTailoring);
router.post("/jobs/:id/prep", runPrep);
router.delete("/jobs/:id/:kind", removeJobResult);
router.post("/rounds/:roundId/debrief", runDebrief);
router.delete("/rounds/:roundId/:kind", removeRoundResult);

export default router;
