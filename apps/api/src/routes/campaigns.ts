import { Router } from "express";
import { campaignSchema } from "@crm/shared";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { toInputJson } from "../lib/json";
import { requireRole } from "../middleware/requireRole";
import { campaignService } from "../services/campaign.service";

export const campaignsRouter = Router();

campaignsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await campaignService.list());
  })
);

campaignsRouter.post(
  "/",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const input = campaignSchema.parse(req.body);
    const { imageId, ...campaignInput } = input;
    const campaign = await prisma.campaign.create({
      data: {
        name: campaignInput.name,
        description: campaignInput.description,
        segment: toInputJson(campaignInput.segment),
        message: campaignInput.message,
        link: campaignInput.link || undefined,
        startAt: campaignInput.startAt ? new Date(campaignInput.startAt) : undefined,
        sendTime: campaignInput.sendTime,
        dailyLimit: campaignInput.dailyLimit,
        pauseSeconds: campaignInput.pauseSeconds,
        sensitive: campaignInput.sensitive,
        image: imageId ? { connect: { id: imageId } } : undefined
      }
    });
    await auditLog(req, "CAMPAIGN_CREATED", { entityType: "Campaign", entityId: campaign.id });
    res.status(201).json(campaign);
  })
);

campaignsRouter.get(
  "/:id/preview",
  asyncHandler(async (req, res) => {
    res.json(await campaignService.preview(req.params.id));
  })
);

campaignsRouter.patch(
  "/:id",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const existing = await prisma.campaign.findUniqueOrThrow({ where: { id: req.params.id } });
    if (existing.status === "ACTIVE" || existing.status === "SCHEDULED") {
      res.status(409).json({ error: "Pausa la campaña antes de editarla." });
      return;
    }
    const input = campaignSchema.partial().extend({
      imageId: z.string().nullable().optional(),
      startAt: z.string().nullable().optional()
    }).parse(req.body);
    const data = {
      name: input.name,
      description: input.description,
      segment: input.segment === undefined ? undefined : toInputJson(input.segment),
      message: input.message,
      imageId: input.imageId,
      link: input.link,
      startAt: input.startAt ? new Date(input.startAt) : input.startAt,
      sendTime: input.sendTime,
      dailyLimit: input.dailyLimit,
      pauseSeconds: input.pauseSeconds,
      sensitive: input.sensitive
    };
    const campaign = await prisma.campaign.update({ where: { id: req.params.id }, data });
    await auditLog(req, "CAMPAIGN_UPDATED", { entityType: "Campaign", entityId: req.params.id });
    res.json(campaign);
  })
);

campaignsRouter.post(
  "/:id/activate",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.activate(req.params.id);
    await auditLog(req, "CAMPAIGN_ACTIVATED", { entityType: "Campaign", entityId: req.params.id });
    res.json(campaign);
  })
);

campaignsRouter.post(
  "/:id/pause",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const campaign = await campaignService.pause(req.params.id);
    await auditLog(req, "CAMPAIGN_PAUSED", { entityType: "Campaign", entityId: req.params.id });
    res.json(campaign);
  })
);

campaignsRouter.post(
  "/:id/cancel-pending",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const result = await campaignService.cancelPending(req.params.id);
    await auditLog(req, "CAMPAIGN_PENDING_CANCELLED", { entityType: "Campaign", entityId: req.params.id, metadata: result });
    res.json(result);
  })
);

campaignsRouter.delete(
  "/:id",
  requireRole("OWNER", "ADMIN"),
  asyncHandler(async (req, res) => {
    await prisma.campaign.delete({ where: { id: req.params.id } });
    await auditLog(req, "CAMPAIGN_DELETED", { entityType: "Campaign", entityId: req.params.id });
    res.json({ ok: true });
  })
);
