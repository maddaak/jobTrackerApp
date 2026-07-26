import { Router } from "express";
import { health, healthDeep } from "../controllers/healthController.js";

const router = Router();

router.get("/health", health);
router.get("/health/deep", healthDeep);

export default router;
