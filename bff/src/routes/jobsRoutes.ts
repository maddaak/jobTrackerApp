import { Router, type Request, type Response, type NextFunction } from "express";
import multer from "multer";
import {
  create,
  list,
  get,
  update,
  remove,
  getDetail,
  updateDetail,
  getResumeRecommendationForJob,
  addLink,
  removeLink,
  removeStage,
} from "../controllers/jobsController.js";
import {
  list as listImages,
  upload as uploadImage,
  download as downloadImage,
  remove as removeImage,
} from "../controllers/jobImagesController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { validateRouteId, NUMERIC_ID, MONGO_ID } from "../middleware/validateRouteId.js";

// Matches core's own cap, so an oversized file is refused here rather than crossing the wire first.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const uploadImageFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
});

const router = Router();

router.use(requireAuth);
router.param("id", validateRouteId(NUMERIC_ID, "invalid job id"));
router.param("targetId", validateRouteId(NUMERIC_ID, "invalid job id"));
router.param("imageId", validateRouteId(MONGO_ID, "invalid image id"));
router.post("/", create);
router.get("/", list);
router.get("/:id", get);
router.patch("/:id", update);
router.delete("/:id", remove);
router.get("/:id/detail", getDetail);
router.put("/:id/detail", updateDetail);
router.get("/:id/resume-recommendation", getResumeRecommendationForJob);
router.delete("/:id/stages", removeStage);
router.post("/:id/links", addLink);
router.delete("/:id/links/:targetId", removeLink);
router.get("/:id/images", listImages);
router.post("/:id/images", uploadImageFile.single("file"), uploadImage);
router.get("/:id/images/:imageId", downloadImage);
router.delete("/:id/images/:imageId", removeImage);

// Multer reports a rejected upload through next(err), which would otherwise surface as a 500.
router.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "images must be 10MB or smaller" });
      return;
    }
    res.status(400).json({ error: "invalid file upload" });
    return;
  }
  next(err);
});

export default router;
