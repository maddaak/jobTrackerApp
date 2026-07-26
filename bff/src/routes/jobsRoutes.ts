import { Router } from "express";
import { create, list, get, update, remove, getDetail, updateDetail } from "../controllers/jobsController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.post("/", create);
router.get("/", list);
router.get("/:id", get);
router.patch("/:id", update);
router.delete("/:id", remove);
router.get("/:id/detail", getDetail);
router.put("/:id/detail", updateDetail);

export default router;
