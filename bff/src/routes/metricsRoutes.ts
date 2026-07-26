import { Router } from "express";
import { get } from "../controllers/metricsController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.get("/", get);

export default router;
