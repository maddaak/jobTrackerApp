import express from "express";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/authRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import aiStatusRoutes from "./routes/aiStatusRoutes.js";
import updateRoutes from "./routes/updateRoutes.js";
import jobsRoutes from "./routes/jobsRoutes.js";
import interviewsRoutes from "./routes/interviewsRoutes.js";
import metricsRoutes from "./routes/metricsRoutes.js";
import scrapeRoutes from "./routes/scrapeRoutes.js";
import resumesRoutes from "./routes/resumesRoutes.js";
import offersRoutes from "./routes/offersRoutes.js";
import remindersRoutes from "./routes/remindersRoutes.js";
import accountRoutes from "./routes/accountRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import seasonsRoutes from "./routes/seasonsRoutes.js";
import { requestLimiter } from "./middleware/rateLimiters.js";
import { keepSession, requireAuth } from "./middleware/requireAuth.js";
import { sameOrigin } from "./middleware/sameOrigin.js";
import { TRUSTED_PROXIES } from "./config.js";

export const app = express();
// Trust nginx plus any proxy in front of it, and no more, so the limits see the real visitor and a spoofed
// X-Forwarded-For can't pass for another one.
app.set("trust proxy", 1 + TRUSTED_PROXIES);
app.use(requestLimiter);
app.use(sameOrigin);
app.use(cookieParser());
// A spreadsheet of a whole search, notes and all, runs past the default 100kb; only this path gets more,
// and only once signed in, so nobody else can make the bff parse 5mb. keepSession carries the check through
// the body's stream events, so the jobs router sees it done and doesn't ask core again.
app.use("/jobs/import", requireAuth, keepSession(express.json({ limit: "5mb" })));
app.use(express.json());

app.use(healthRoutes);
app.use(aiStatusRoutes);
app.use(updateRoutes);

app.use("/auth", authRoutes);
app.use("/jobs", jobsRoutes);
app.use("/interviews", interviewsRoutes);
app.use("/metrics", metricsRoutes);
app.use("/scrape", scrapeRoutes);
app.use("/resumes", resumesRoutes);
app.use("/offers", offersRoutes);
app.use("/reminders", remindersRoutes);
app.use("/account", accountRoutes);
app.use("/seasons", seasonsRoutes);
app.use("/ai", aiRoutes);

// JSON like every other answer, rather than Express's HTML 404 page.
app.use((_req: express.Request, res: express.Response) => {
  res.status(404).json({ error: "not found" });
});

// Generic body so stack traces never leak; honor a middleware 4xx (bad JSON, oversized body).
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  if (typeof status === "number" && status >= 400 && status < 500) {
    // The client's mistake, not ours: a stack trace per malformed body would bury real failures.
    res.status(status).json({ error: "invalid request" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "internal error" });
});
