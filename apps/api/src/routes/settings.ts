import { Router } from "express";
import { prisma } from "../lib/prisma";
import { encryptSecret } from "../lib/crypto";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { toInputJson } from "../lib/json";
import { requireRole } from "../middleware/requireRole";
import { systemService } from "../services/system.service";

export const settingsRouter = Router();

settingsRouter.get(
  "/system-status",
  asyncHandler(async (_req, res) => {
    res.json(await systemService.status());
  })
);

settingsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const settings = await prisma.setting.findMany({ where: { sensitive: false } });
    res.json(Object.fromEntries(settings.map((setting) => [setting.key, setting.value])));
  })
);

settingsRouter.put(
  "/",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const entries = Object.entries(req.body ?? {});
    for (const [key, value] of entries) {
      if (key === "paymentLink" && value !== "") {
        if (typeof value !== "string" || value.length > 2_000) {
          const error = new Error("El link de pago no es valido.");
          (error as Error & { status?: number }).status = 400;
          throw error;
        }
        try {
          const url = new URL(value);
          if (url.protocol !== "https:") throw new Error("invalid protocol");
        } catch {
          const error = new Error("El link de pago debe ser una URL completa que empiece con https://.");
          (error as Error & { status?: number }).status = 400;
          throw error;
        }
      }
      const sensitive = key.toLowerCase().includes("key") || key.toLowerCase().includes("secret");
      const storedValue = sensitive && typeof value === "string" ? encryptSecret(value) : value;
      await prisma.setting.upsert({
        where: { key },
        update: { value: toInputJson(storedValue), sensitive },
        create: { key, value: toInputJson(storedValue), sensitive }
      });
    }
    await auditLog(req, "SETTINGS_UPDATED", { metadata: { keys: entries.map(([key]) => key) } });
    res.json({ ok: true });
  })
);
