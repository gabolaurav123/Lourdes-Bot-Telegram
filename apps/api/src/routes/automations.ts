import { Router } from "express";
import { automationSchema } from "@crm/shared";
import { z } from "zod";
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
    const automations = await prisma.automation.findMany({ include: { _count: { select: { runs: true } } }, orderBy: { createdAt: "desc" } });
    if (!automations.length) {
      res.json([]);
      return;
    }
    const ids = automations.map((automation) => automation.id);
    const [groups, failures] = await Promise.all([
      prisma.automationRun.groupBy({
        by: ["automationId", "status"],
        where: { automationId: { in: ids } },
        _count: { _all: true }
      }),
      prisma.automationRun.findMany({
        where: { automationId: { in: ids }, status: "FAILED" },
        orderBy: { createdAt: "desc" },
        take: 30,
        select: { automationId: true, error: true, createdAt: true, lead: { select: { id: true, name: true } } }
      })
    ]);
    res.json(automations.map((automation) => ({
      ...automation,
      progress: Object.fromEntries(groups.filter((row) => row.automationId === automation.id).map((row) => [row.status.toLowerCase(), row._count._all])),
      recentErrors: failures.filter((failure) => failure.automationId === automation.id).slice(0, 5)
    })));
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
    const input = automationSchema.partial().extend({ status: z.enum(["ACTIVE", "INACTIVE"]).optional() }).parse(req.body);
    const data = {
      ...input,
      conditions: input.conditions === undefined ? undefined : toInputJson(input.conditions),
      actionPayload: input.actionPayload === undefined ? undefined : toInputJson(input.actionPayload),
      segment: input.segment === undefined ? undefined : toInputJson(input.segment)
    };
    const automation = await prisma.automation.update({ where: { id: req.params.id }, data });
    await auditLog(req, "AUTOMATION_UPDATED", { entityType: "Automation", entityId: req.params.id });
    res.json(automation);
  })
);

automationsRouter.delete(
  "/:id",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    await prisma.automation.delete({ where: { id: req.params.id } });
    await auditLog(req, "AUTOMATION_DELETED", { entityType: "Automation", entityId: req.params.id });
    res.json({ ok: true });
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
