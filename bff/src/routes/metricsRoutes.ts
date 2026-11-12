import { Router } from "express";
import { get, seasons, seasonSummary } from "../controllers/metricsController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRouteId, NUMERIC_ID } from "../middleware/validateRouteId.js";

const router = Router();

router.use(requireAuth);
router.param("id", validateRouteId(NUMERIC_ID, "invalid season id"));
router.get("/", get);
router.get("/seasons", seasons);
router.get("/seasons/:id/summary", seasonSummary);

export default router;
