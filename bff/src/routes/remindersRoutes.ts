import { Router } from "express";
import { followUps, getSettings, saveSettings, sendTest } from "../controllers/remindersController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.get("/settings", getSettings);
router.put("/settings", saveSettings);
router.get("/follow-ups", followUps);
router.post("/test", sendTest);

export default router;
