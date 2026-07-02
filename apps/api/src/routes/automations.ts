import { Router } from "express";
import { automationSchema } from "@crm/shared";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { toInputJson } from "../lib/json";
import { requireRole } from "../middleware/requireRole";
import { automationService } from "../services/automation.service";

export const automationsRouter = Router();

automationsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.automation.findMany({ include: { _count: { select: { runs: true } } }, orderBy: { createdAt: "desc" } }));
  })
);

automationsRouter.post(
  "/",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const input = automationSchema.parse(req.body);
    const automation = await prisma.automation.create({
      data: {
        name: input.name,
        trigger: input.trigger,
        conditions: toInputJson(input.conditions),
        delaySeconds: input.delaySeconds,
        action: input.action,
        actionPayload: toInputJson(input.actionPayload),
        executionLimit: input.executionLimit,
        segment: toInputJson(input.segment),
        priority: input.priority,
        sensitive: input.sensitive,
        allowRepeat: input.allowRepeat,
        status: "ACTIVE"
      }
    });
    await auditLog(req, "AUTOMATION_CREATED", { entityType: "Automation", entityId: automation.id });
    res.status(201).json(automation);
  })
);

automationsRouter.patch(
  "/:id",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const automation = await prisma.automation.update({ where: { id: req.params.id }, data: req.body });
    await auditLog(req, "AUTOMATION_UPDATED", { entityType: "Automation", entityId: req.params.id });
    res.json(automation);
  })
);

automationsRouter.post(
  "/trigger/:trigger/:leadId",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const runs = await automationService.scheduleForTrigger(req.params.trigger, req.params.leadId, req.body ?? {});
    res.json({ scheduled: runs.length, runs });
  })
);
