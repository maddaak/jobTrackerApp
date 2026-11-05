import { Router } from "express";
import { register, login, logout, me, registration, forgotPassword, resetPassword } from "../controllers/authController.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { authLimiter, resetLimiter } from "../middleware/rateLimiters.js";

const router = Router();

router.get("/registration", registration);
router.post("/register", authLimiter, register);
router.post("/login", authLimiter, login);
// Limited: each one sends an email, and a reset token is something to guess.
router.post("/forgot-password", resetLimiter, forgotPassword);
router.post("/reset-password", resetLimiter, resetPassword);
router.post("/logout", logout);
router.get("/me", requireAuth, me);

export default router;
