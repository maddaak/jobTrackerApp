import { Router } from "express";
import { create } from "../controllers/scrapeController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.post("/", create);

export default router;
