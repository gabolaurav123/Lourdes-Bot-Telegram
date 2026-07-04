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
    const result = await telegramService.syncDialogs(Number(req.body?.limit ?? config.telegram.syncLimit));
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
