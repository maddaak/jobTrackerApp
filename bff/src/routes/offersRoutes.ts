import { Router } from "express";
import { list, compare, lastComparison } from "../controllers/offersController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();

router.use(requireAuth);
router.get("/", list);
router.get("/compare", lastComparison);
router.post("/compare", compare);

export default router;
