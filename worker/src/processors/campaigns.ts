import { prisma } from "@crm/db";
import { sendToLead } from "../telegram";

async function processCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.status !== "ACTIVE" && campaign.status !== "SCHEDULED") return;
  if (campaign.startAt && campaign.startAt > new Date()) return;

  if (campaign.status === "SCHEDULED") {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "ACTIVE" } });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const sentToday = await prisma.campaignRecipient.count({
    where: { campaignId: campaign.id, status: "SENT", sentAt: { gte: today } }
  });

  if (sentToday >= campaign.dailyLimit) {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "SCHEDULED" } });
    return;
  }

  const recipient = await prisma.campaignRecipient.findFirst({
    where: {
      campaignId: campaign.id,
      status: "PENDING",
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }]
  });

  if (!recipient) {
    const pending = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: "PENDING" } });
    if (pending === 0) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "FINISHED" } });
    }
    return;
  }

  try {
    await sendToLead({
      leadId: recipient.leadId,
      text: campaign.message,
      mediaAssetId: campaign.imageId ?? undefined,
      sensitive: campaign.sensitive,
      intent: "campaign"
    });
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 } }
    });
  } catch (error) {
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        error: error instanceof Error ? error.message : "Error desconocido"
      }
    });
  }

  const nextPending = await prisma.campaignRecipient.findFirst({
    where: { campaignId: campaign.id, status: "PENDING" },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }]
  });
  if (nextPending && (!nextPending.scheduledAt || nextPending.scheduledAt <= new Date())) {
    await prisma.campaignRecipient.update({
      where: { id: nextPending.id },
      data: { scheduledAt: new Date(Date.now() + campaign.pauseSeconds * 1000) }
    });
  }
}

export async function pollCampaigns() {
  const campaigns = await prisma.campaign.findMany({
    where: {
      status: { in: ["ACTIVE", "SCHEDULED"] },
      OR: [{ startAt: null }, { startAt: { lte: new Date() } }]
    },
    orderBy: { updatedAt: "asc" },
    take: 10
  });

  for (const campaign of campaigns) {
    await processCampaign(campaign.id);
  }
}
