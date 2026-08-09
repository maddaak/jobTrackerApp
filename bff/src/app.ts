import express from "express";
import cookieParser from "cookie-parser";
import { generalLimiter } from "./middleware/rateLimiters.js";
import authRoutes from "./routes/authRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import aiStatusRoutes from "./routes/aiStatusRoutes.js";
import updateRoutes from "./routes/updateRoutes.js";
import jobsRoutes from "./routes/jobsRoutes.js";
import interviewsRoutes from "./routes/interviewsRoutes.js";
import metricsRoutes from "./routes/metricsRoutes.js";
import scrapeRoutes from "./routes/scrapeRoutes.js";
import resumesRoutes from "./routes/resumesRoutes.js";

export const app = express();
// Trust one hop (nginx) so a spoofed X-Forwarded-For can't bypass the rate limiters.
app.set("trust proxy", 1);
app.use(cookieParser());
app.use(express.json());

// Mounted before the limiter so uptime probes never get a 429.
app.use(healthRoutes);
app.use(generalLimiter);

// Unauthenticated but rate limited, so after generalLimiter unlike health.
app.use(aiStatusRoutes);

app.use(updateRoutes);

app.use("/auth", authRoutes);
app.use("/jobs", jobsRoutes);
app.use("/interviews", interviewsRoutes);
app.use("/metrics", metricsRoutes);
app.use("/scrape", scrapeRoutes);
app.use("/resumes", resumesRoutes);

// Generic body so stack traces never leak; honor a middleware 4xx (bad JSON, oversized body).
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: "invalid request" });
    return;
  }
  res.status(500).json({ error: "internal error" });
});
