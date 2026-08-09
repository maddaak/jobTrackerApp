import { Router } from "express";
import { create, update, list, upcoming, remove } from "../controllers/interviewsController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRouteId, ROUND_ID } from "../middleware/validateRouteId.js";

const router = Router();

router.use(requireAuth);
router.param("id", validateRouteId(ROUND_ID, "invalid interview id"));
router.post("/", create);
router.patch("/:id", update);
router.get("/upcoming", upcoming);
router.get("/", list);
router.delete("/:id", remove);

export default router;
