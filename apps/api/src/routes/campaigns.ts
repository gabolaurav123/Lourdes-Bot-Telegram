import { Router } from "express";
import { campaignSchema } from "@crm/shared";
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
    res.json(await prisma.campaign.findMany({ include: { image: true, _count: { select: { recipients: true } } }, orderBy: { createdAt: "desc" } }));
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
