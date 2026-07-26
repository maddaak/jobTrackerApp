import rateLimit from "express-rate-limit";

export const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 100 });
export const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10 });
