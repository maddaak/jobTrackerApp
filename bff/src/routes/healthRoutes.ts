import { Router } from "express";
import { health, healthDeep } from "../controllers/healthController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// Shallow probe stays public for uptime monitors. The deep probe talks to internal
// services, so it is gated behind auth.
router.get("/health", health);
router.get("/health/deep", requireAuth, healthDeep);

export default router;
