import express from "express";
import cookieParser from "cookie-parser";
import { generalLimiter } from "./middleware/rateLimiters.js";
import authRoutes from "./routes/authRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import aiStatusRoutes from "./routes/aiStatusRoutes.js";
import jobsRoutes from "./routes/jobsRoutes.js";
import interviewsRoutes from "./routes/interviewsRoutes.js";
import metricsRoutes from "./routes/metricsRoutes.js";
import scrapeRoutes from "./routes/scrapeRoutes.js";
import resumesRoutes from "./routes/resumesRoutes.js";

export const app = express();
// Trust exactly one hop (nginx) so we read nginx's client IP and ignore a spoofed
// X-Forwarded-For that would bypass the rate limiters.
app.set("trust proxy", 1);
app.use(cookieParser());
app.use(express.json());

// Health probes must never be rate limited (a monitor hitting /health should never
// get a 429), so mount them ahead of the global limiter.
app.use(healthRoutes);
app.use(generalLimiter);

// Unauthenticated (the login screen reads it to decide whether to show AI features) but still
// rate limited, so it sits after generalLimiter, unlike health.
app.use(aiStatusRoutes);

app.use("/auth", authRoutes);
app.use("/jobs", jobsRoutes);
app.use("/interviews", interviewsRoutes);
app.use("/metrics", metricsRoutes);
app.use("/scrape", scrapeRoutes);
app.use("/resumes", resumesRoutes);

// Log the real error server side but return a generic body so stack traces never leak.
// Honor a middleware 4xx (express.json() throws 400 on malformed JSON, 413 over the body
// limit) so the client can tell bad input from a backend failure; anything else is a 500.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    res.status(status).json({ error: "invalid request" });
    return;
  }
  res.status(500).json({ error: "internal error" });
});
