import { Router } from "express";
import { get, seasons } from "../controllers/metricsController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.get("/", get);
router.get("/seasons", seasons);

export default router;
