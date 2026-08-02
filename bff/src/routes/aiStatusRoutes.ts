import { Router } from "express";
import { get } from "../controllers/aiStatusController.js";

const router = Router();

// Public and unauthenticated: exposes only a boolean, no internal detail.
router.get("/ai-status", get);

export default router;
