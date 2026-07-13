import { Router } from "express";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { config } from "../config";
import { requireRole } from "../middleware/requireRole";
import { telegramService } from "../services/telegram.service";

export const telegramRouter = Router();

telegramRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    res.json(await telegramService.status());
  })
);

telegramRouter.post(
  "/qr/start",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const status = await telegramService.startQrLogin();
    await auditLog(req, "TELEGRAM_QR_STARTED", { entityType: "TelegramSession" });
    res.json(status);
  })
);

telegramRouter.post(
  "/sync",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const requestedLimit = Number(req.body?.limit ?? config.telegram.syncLimit);
    const limit = Math.min(5000, Math.max(1, Number.isFinite(requestedLimit) ? requestedLimit : config.telegram.syncLimit));
    const result = await telegramService.syncDialogs(limit);
    await auditLog(req, "TELEGRAM_SYNC", { metadata: result });
    res.json(result);
  })
);

telegramRouter.post(
  "/logout",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    await telegramService.logout();
    await auditLog(req, "TELEGRAM_LOGOUT");
    res.json({ ok: true });
  })
);

telegramRouter.post(
  "/reset",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    if (req.body?.confirm !== "REINICIAR") {
      res.status(400).json({ error: "Confirmacion requerida" });
      return;
    }

    const result = await telegramService.resetCrmData();
    await auditLog(req, "CRM_RESET", { metadata: result.deleted });
    res.json(result);
  })
);
