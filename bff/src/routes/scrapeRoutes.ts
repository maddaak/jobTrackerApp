import { Router } from "express";
import { create, fromText } from "../controllers/scrapeController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.post("/", create);
router.post("/text", fromText);

export default router;
