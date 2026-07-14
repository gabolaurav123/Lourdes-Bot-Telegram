import { Router } from "express";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { requireRole } from "../middleware/requireRole";
import { aiService } from "../services/ai.service";

export const aiRouter = Router();

function publicConfig(aiConfig: Awaited<ReturnType<typeof aiService.getConfig>>) {
  return {
    ...aiConfig,
    encryptedApiKey: Boolean(aiConfig.encryptedApiKey),
    apiKeyConfigured: Boolean(aiConfig.encryptedApiKey || process.env.OPENAI_API_KEY),
    apiKeySource: aiConfig.encryptedApiKey ? "panel" : process.env.OPENAI_API_KEY ? "environment" : "none"
  };
}

aiRouter.get(
  "/config",
  asyncHandler(async (_req, res) => {
    const config = await aiService.getConfig();
    res.json(publicConfig(config));
  })
);

aiRouter.put(
  "/config",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const updated = await aiService.updateConfig(req.body);
    await auditLog(req, "AI_CONFIG_UPDATED");
    res.json(publicConfig(updated));
  })
);

aiRouter.patch(
  "/enabled",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    if (typeof req.body?.enabled !== "boolean") {
      res.status(400).json({ error: "El campo enabled debe ser verdadero o falso" });
      return;
    }
    const updated = await aiService.setGlobalEnabled(req.body.enabled);
    await auditLog(req, req.body.enabled ? "AI_GLOBAL_ENABLED" : "AI_GLOBAL_DISABLED");
    res.json(publicConfig(updated));
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
