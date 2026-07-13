import { Router } from "express";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { requireRole } from "../middleware/requireRole";
import { aiService } from "../services/ai.service";

export const aiRouter = Router();

aiRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    const config = await aiService.getConfig();
    res.json({ ...config, encryptedApiKey: Boolean(config.encryptedApiKey) });
  })
);

aiRouter.put(
  "/config",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const updated = await aiService.updateConfig(req.body);
    await auditLog(req, "AI_CONFIG_UPDATED");
    res.json({ ...updated, encryptedApiKey: Boolean(updated.encryptedApiKey) });
  })
);

aiRouter.post(
  "/test",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const result = await aiService.testConnection();
    await auditLog(req, "AI_CONNECTION_TESTED", { metadata: { model: result.model, ok: result.ok } });
    res.json(result);
  })
);
