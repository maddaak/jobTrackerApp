import { Router } from "express";
import { health, healthDeep } from "../controllers/healthController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// Deep probe hits internal services, so it's gated behind auth; shallow stays public.
router.get("/health", health);
router.get("/health/deep", requireAuth, healthDeep);

export default router;
