import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import path from "node:path";
import { config } from "./config";
import { errorHandler } from "./middleware/error";
import { requireAuth } from "./middleware/auth";
import { authRouter } from "./routes/auth";
import { dashboardRouter } from "./routes/dashboard";
import { telegramRouter } from "./routes/telegram";
import { leadsRouter } from "./routes/leads";
import { conversationsRouter } from "./routes/conversations";
import { campaignsRouter } from "./routes/campaigns";
import { automationsRouter } from "./routes/automations";
import { templatesRouter } from "./routes/templates";
import { mediaRouter } from "./routes/media";
import { purchasesRouter } from "./routes/purchases";
import { settingsRouter } from "./routes/settings";
import { aiRouter } from "./routes/ai";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || config.corsOrigins.includes(origin.replace(/\/$/, ""))) {
          callback(null, true);
          return;
        }
        callback(new Error(`Origin not allowed by CORS: ${origin}`));
      },
      credentials: true
    })
  );
  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 240,
      standardHeaders: true,
      legacyHeaders: false
    })
  );
  app.use("/uploads", express.static(path.resolve(config.media.localDir)));

  app.get("/", (_req, res) => {
    res.json({
      ok: true,
      service: "telegram-consent-crm-api",
      message: "API activa. Abre la URL del servicio WEB para usar el CRM.",
      health: "/health"
    });
  });
  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/auth", authRouter);

  app.use("/api", requireAuth);
  app.use("/api/dashboard", dashboardRouter);
  app.use("/api/telegram", telegramRouter);
  app.use("/api/leads", leadsRouter);
  app.use("/api/conversations", conversationsRouter);
  app.use("/api/campaigns", campaignsRouter);
  app.use("/api/automations", automationsRouter);
  app.use("/api/templates", templatesRouter);
  app.use("/api/media", mediaRouter);
  app.use("/api/purchases", purchasesRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/ai", aiRouter);

  app.use(errorHandler);
  return app;
}
