import { Router } from "express";
import { get } from "../controllers/updateController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

// Behind auth: the running version is only shown to a logged-in user, and publishing it
// unauthenticated would tell anyone which release a deployment is on.
router.get("/update-status", requireAuth, get);

export default router;
