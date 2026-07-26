import express from "express";
import cookieParser from "cookie-parser";
import { generalLimiter } from "./middleware/rateLimiters.js";
import authRoutes from "./routes/authRoutes.js";
import healthRoutes from "./routes/healthRoutes.js";
import jobsRoutes from "./routes/jobsRoutes.js";
import interviewsRoutes from "./routes/interviewsRoutes.js";
import metricsRoutes from "./routes/metricsRoutes.js";
import scrapeRoutes from "./routes/scrapeRoutes.js";
import resumesRoutes from "./routes/resumesRoutes.js";

export const app = express();
app.set("trust proxy", true); // nginx sits in front; trust its X-Forwarded-For/X-Real-IP
app.use(cookieParser());
app.use(express.json());
app.use(generalLimiter);

app.use(healthRoutes);
app.use("/auth", authRoutes);
app.use("/jobs", jobsRoutes);
app.use("/interviews", interviewsRoutes);
app.use("/metrics", metricsRoutes);
app.use("/scrape", scrapeRoutes);
app.use("/resumes", resumesRoutes);
