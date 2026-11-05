import { Router } from "express";
import multer from "multer";
import {
  addSample,
  deleteSample,
  exportData,
  get,
  restoreData,
  sampleJobs,
  signOutOtherDevices,
  update,
  updatePassword,
} from "../controllers/accountController.js";
import { keepSession, requireAuth } from "../middleware/requireAuth.js";
import { authLimiter } from "../middleware/rateLimiters.js";
import { uploadErrors } from "../middleware/uploadErrors.js";
import { MAX_BACKUP_BYTES } from "../config.js";

const router = Router();
const backupFile = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BACKUP_BYTES } });

router.use(requireAuth);
router.get("/", get);
// An email change checks the current password, so that save is a guessing target like login; a name change isn't.
router.put("/", (req, res, next) => (req.body?.currentPassword ? authLimiter(req, res, next) : next()), update);
// Checks the current password, so it's a guessing target like login.
router.put("/password", authLimiter, updatePassword);
router.post("/sessions/end-others", signOutOtherDevices);
router.get("/export", exportData);
router.get("/sample", sampleJobs);
router.post("/sample", addSample);
router.delete("/sample", deleteSample);
router.post("/restore", keepSession(backupFile.single("file")), restoreData);
router.use(uploadErrors("backups must be 200MB or smaller"));

export default router;
