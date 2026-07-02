import type { Job } from "bullmq";
import { prisma } from "@crm/db";
import { createWorker } from "../queues";
import { sendToLead } from "../telegram";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function startCampaignWorker() {
  return createWorker("campaigns", async (job: Job<{ campaignId: string }>) => {
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: job.data.campaignId } });
    if (campaign.status !== "ACTIVE") return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sentToday = await prisma.campaignRecipient.count({
      where: { campaignId: campaign.id, status: "SENT", sentAt: { gte: today } }
    });
    const remaining = Math.max(0, campaign.dailyLimit - sentToday);
    if (remaining === 0) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "SCHEDULED" } });
      return;
    }

    const recipients = await prisma.campaignRecipient.findMany({
      where: { campaignId: campaign.id, status: "PENDING" },
      include: { lead: true },
      take: remaining,
      orderBy: { createdAt: "asc" }
    });

    for (const recipient of recipients) {
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
      await sleep(campaign.pauseSeconds * 1000);
    }

    const pending = await prisma.campaignRecipient.count({ where: { campaignId: campaign.id, status: "PENDING" } });
    if (pending === 0) {
      await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "FINISHED" } });
    }
  });
}
