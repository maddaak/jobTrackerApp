import { Router } from "express";
import multer from "multer";
import { create, list, remove, match, summarize, setCustomSummary } from "../controllers/resumesController.js";
import { keepSession, requireAuth } from "../middleware/requireAuth.js";
import { uploadErrors } from "../middleware/uploadErrors.js";
import { validateRouteId, RESUME_ID } from "../middleware/validateRouteId.js";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// Browsers send file names as UTF-8; multer's latin1 default garbles "Résumé.pdf", and the name is what
// a job's recommended and sent resume point at.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  defParamCharset: "utf8",
});

const router = Router();

router.use(requireAuth);
router.param("id", validateRouteId(RESUME_ID, "invalid resume id"));
router.post("/", keepSession(upload.single("file")), create);
router.get("/", list);
router.delete("/:id", remove);
router.post("/match", match);
router.post("/:id/summarize", summarize);
router.post("/:id/custom-summary", setCustomSummary);
router.use(uploadErrors("file exceeds the 10MB size limit"));

export default router;
