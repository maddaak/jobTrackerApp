import { Router } from "express";
import multer from "multer";
import { create, list, remove, match } from "../controllers/resumesController.js";
import { requireAuth } from "../middleware/requireAuth.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();

router.use(requireAuth);
router.post("/", upload.single("file"), create);
router.get("/", list);
router.delete("/:id", remove);
router.post("/match", match);

export default router;
