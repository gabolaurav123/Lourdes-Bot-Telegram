import type { Prisma } from "@prisma/client";
import { prisma } from "@crm/db";
import { config } from "../config";
import { sendToLead } from "../telegram";
import { nextDailySendAt, startOfDayInZone } from "../time";

type CampaignRuntimeStats = {
  nextAllowedAt?: string;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function refreshCampaignStats(campaignId: string, runtime: CampaignRuntimeStats = {}) {
  const rows = await prisma.campaignRecipient.groupBy({
    by: ["status"],
    where: { campaignId },
    _count: { _all: true }
  });
  const counts = Object.fromEntries(rows.map((row) => [row.status.toLowerCase(), row._count._all]));
  const lastFailure = await prisma.campaignRecipient.findFirst({
    where: { campaignId, status: "FAILED" },
    orderBy: { lastAttemptAt: "desc" },
    select: { error: true, lastAttemptAt: true }
  });
  const pending = Number(counts.pending ?? 0);
  const processing = Number(counts.processing ?? 0);

  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const currentStats = (campaign.stats ?? {}) as CampaignRuntimeStats;
  const stats = {
    ...counts,
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    lastProcessedAt: new Date().toISOString(),
    lastError: lastFailure?.error ?? null,
    nextAllowedAt: runtime.nextAllowedAt ?? currentStats.nextAllowedAt ?? null
  } satisfies Prisma.InputJsonObject;

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      status: pending === 0 && processing === 0 ? "FINISHED" : undefined,
      stats
    }
  });
}

async function recoverStaleRecipients(campaignId: string) {
  const staleBefore = new Date(Date.now() - config.processingLockMs);
  await prisma.campaignRecipient.updateMany({
    where: {
      campaignId,
      status: "PROCESSING",
      lastAttemptAt: { lte: staleBefore }
    },
    data: {
      status: "PENDING",
      scheduledAt: new Date(),
      error: "El worker se reinicio durante el envio; destinatario recuperado para reintento."
    }
  });
}

async function claimNextRecipient(campaignId: string) {
  const candidate = await prisma.campaignRecipient.findFirst({
    where: {
      campaignId,
      status: "PENDING",
      OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }]
    },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }]
  });
  if (!candidate) return null;

  const claimed = await prisma.campaignRecipient.updateMany({
    where: { id: candidate.id, status: "PENDING" },
    data: { status: "PROCESSING", lastAttemptAt: new Date() }
  });
  return claimed.count === 1 ? candidate : null;
}

async function processCampaign(campaignId: string) {
  const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  if (campaign.status !== "ACTIVE" && campaign.status !== "SCHEDULED") return;
  if (campaign.startAt && campaign.startAt > new Date()) return;

  const runtime = (campaign.stats ?? {}) as CampaignRuntimeStats;
  if (runtime.nextAllowedAt && new Date(runtime.nextAllowedAt) > new Date()) return;

  if (campaign.status === "SCHEDULED") {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "ACTIVE", startAt: null } });
  }

  await recoverStaleRecipients(campaign.id);

  const today = startOfDayInZone(config.timezone);
  const sentToday = await prisma.campaignRecipient.count({
    where: { campaignId: campaign.id, status: "SENT", sentAt: { gte: today } }
  });

  if (sentToday >= campaign.dailyLimit) {
    const nextStart = nextDailySendAt(campaign.sendTime, config.timezone, new Date(), true);
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: "SCHEDULED", startAt: nextStart }
    });
    return;
  }

  const recipient = await claimNextRecipient(campaign.id);
  if (!recipient) {
    const remaining = await prisma.campaignRecipient.count({
      where: { campaignId: campaign.id, status: { in: ["PENDING", "PROCESSING"] } }
    });
    if (remaining === 0) await refreshCampaignStats(campaign.id);
    return;
  }

  const text = campaign.link && !campaign.message.includes(campaign.link)
    ? `${campaign.message}\n\n${campaign.link}`
    : campaign.message;
  const nextAllowedAt = new Date(Date.now() + campaign.pauseSeconds * 1000).toISOString();

  try {
    await sendToLead({
      leadId: recipient.leadId,
      text,
      mediaAssetId: campaign.imageId ?? undefined,
      sensitive: campaign.sensitive,
      intent: "campaign"
    });
    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: "SENT",
        sentAt: new Date(),
        attempts: { increment: 1 },
        error: null
      }
    });
    await prisma.auditLog.create({
      data: {
        action: "CAMPAIGN_MESSAGE_SENT",
        entityType: "CampaignRecipient",
        entityId: recipient.id,
        metadata: { campaignId: campaign.id, leadId: recipient.leadId }
      }
    });
  } catch (error) {
    const message = errorMessage(error);
    const attempts = recipient.attempts + 1;
    const willRetry = attempts < config.maxSendAttempts;
    const retryDelay = Math.min(15 * 60_000, campaign.pauseSeconds * 1000 * 2 ** attempts);

    await prisma.campaignRecipient.update({
      where: { id: recipient.id },
      data: {
        status: willRetry ? "PENDING" : "FAILED",
        scheduledAt: willRetry ? new Date(Date.now() + retryDelay) : null,
        attempts: { increment: 1 },
        error: message
      }
    });
    await prisma.auditLog.create({
      data: {
        action: willRetry ? "CAMPAIGN_MESSAGE_RETRY" : "CAMPAIGN_MESSAGE_FAILED",
        entityType: "CampaignRecipient",
        entityId: recipient.id,
        metadata: { campaignId: campaign.id, leadId: recipient.leadId, attempts, error: message }
      }
    });
  }

  await refreshCampaignStats(campaign.id, { nextAllowedAt });
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
    await processCampaign(campaign.id).catch(async (error) => {
      const message = errorMessage(error);
      console.error(`Campaign ${campaign.id} failed:`, message);
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          stats: {
            ...((campaign.stats ?? {}) as Prisma.InputJsonObject),
            lastProcessedAt: new Date().toISOString(),
            lastError: message
          }
        }
      }).catch(() => undefined);
    });
  }
}
