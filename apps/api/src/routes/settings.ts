import { Router } from "express";
import { prisma } from "../lib/prisma";
import { encryptSecret } from "../lib/crypto";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { toInputJson } from "../lib/json";
import { requireRole } from "../middleware/requireRole";

export const settingsRouter = Router();

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
