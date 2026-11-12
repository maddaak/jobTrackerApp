import { Router } from "express";
import multer from "multer";
import {
  create,
  importRows,
  list,
  get,
  update,
  remove,
  getDetail,
  updateDetail,
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
import { save as saveOffer, accept as acceptOffer, checkMarket, removeMarketCheck } from "../controllers/offersController.js";
import { keepSession, requireAuth } from "../middleware/requireAuth.js";
import { uploadErrors } from "../middleware/uploadErrors.js";
import { validateRouteId, NUMERIC_ID, MONGO_ID } from "../middleware/validateRouteId.js";

// Matches core's own cap, so an oversized file is refused here rather than crossing the wire first.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const uploadImageFile = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  // Browsers send file names as UTF-8; multer's default reads them as latin1.
  defParamCharset: "utf8",
});

const router = Router();

router.use(requireAuth);
router.param("id", validateRouteId(NUMERIC_ID, "invalid job id"));
router.param("targetId", validateRouteId(NUMERIC_ID, "invalid job id"));
router.param("imageId", validateRouteId(MONGO_ID, "invalid image id"));
router.post("/", create);
router.post("/import", importRows);
router.get("/", list);
router.get("/:id", get);
router.patch("/:id", update);
router.delete("/:id", remove);
router.get("/:id/detail", getDetail);
router.put("/:id/detail", updateDetail);
router.delete("/:id/stages", removeStage);
router.post("/:id/links", addLink);
router.delete("/:id/links/:targetId", removeLink);
router.put("/:id/offer", saveOffer);
router.put("/:id/offer/acceptance", acceptOffer);
router.post("/:id/offer/market-check", checkMarket);
router.delete("/:id/offer/market-check", removeMarketCheck);
router.get("/:id/images", listImages);
router.post("/:id/images", keepSession(uploadImageFile.single("file")), uploadImage);
router.get("/:id/images/:imageId", downloadImage);
router.delete("/:id/images/:imageId", removeImage);
router.use(uploadErrors("images must be 10MB or smaller"));

export default router;
