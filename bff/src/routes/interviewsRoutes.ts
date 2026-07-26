import { Router } from "express";
import { create, update, list, remove } from "../controllers/interviewsController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.post("/", create);
router.patch("/:id", update);
router.get("/", list);
router.delete("/:id", remove);

export default router;
