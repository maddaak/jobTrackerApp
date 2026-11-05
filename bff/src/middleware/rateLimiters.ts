import rateLimit from "express-rate-limit";
import { REQUESTS_PER_MINUTE } from "../config.js";

// Login and register, against password guessing. Core also slows guessing on the account itself, so a
// guesser spread over many addresses doesn't get ten tries from each.
// JSON like every other answer, so the sign-in page shows the reason instead of "request failed".
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "too many sign-in attempts from here; try again in 15 minutes" },
});

// Its own counter, so asking for reset emails can't use up the owner's login attempts, or the reverse.
export const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: "too many password reset requests from here; try again in 15 minutes" },
});

// A ceiling on everything, set far above real use: the old 100 per 15 minutes blocked the owner after
// opening ~20 cards. This only stops a flood or a script. The health check is left out for Docker's sake.
export const requestLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: REQUESTS_PER_MINUTE,
  skip: req => req.path === "/health",
  message: { error: "too many requests; slow down and try again in a minute" },
});
