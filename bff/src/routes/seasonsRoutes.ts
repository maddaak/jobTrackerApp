import { Router } from "express";
import { create, list, moveJob, remove, rename, view } from "../controllers/seasonsController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRouteId, NUMERIC_ID } from "../middleware/validateRouteId.js";

const router = Router();

router.use(requireAuth);
router.param("id", validateRouteId(NUMERIC_ID, "invalid season id"));
router.param("jobId", validateRouteId(NUMERIC_ID, "invalid job id"));
router.get("/", list);
router.post("/", create);
router.put("/active", view);
router.patch("/:id", rename);
router.delete("/:id", remove);
router.put("/:id/jobs/:jobId", moveJob);

export default router;
