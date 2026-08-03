import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import { create, list, remove, match, summarize, setCustomSummary } from "../controllers/resumesController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRouteId, RESUME_ID } from "../middleware/validateRouteId.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_UPLOAD_BYTES } });

const router = Router();

router.use(requireAuth);
router.param("id", validateRouteId(RESUME_ID, "invalid resume id"));
router.post("/", upload.single("file"), create);
router.get("/", list);
router.delete("/:id", remove);
router.post("/match", match);
router.post("/:id/summarize", summarize);
router.post("/:id/custom-summary", setCustomSummary);

// multer rejects a bad upload via next(err), which would otherwise become a generic 500.
// Map it to a client error instead: 413 for the size limit, 400 for anything else.
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "file exceeds the 10MB size limit" });
      return;
    }
    res.status(400).json({ error: "invalid file upload" });
    return;
  }
  next(err);
});

export default router;
