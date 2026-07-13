import type { Campaign, Lead, Prisma } from "@prisma/client";
import { EXCLUDED_LEAD_STATUSES, canMessageLead } from "@crm/shared";
import { toInputJson } from "../lib/json";
import { prisma } from "../lib/prisma";
import { systemService } from "./system.service";
import { safeMediaSelect } from "../lib/media";

type Segment = {
  status?: string;
  source?: string;
  tagId?: string;
  ageConfirmed?: boolean;
  optInCommercial?: boolean;
};

function requestError(message: string, status = 400) {
  const error = new Error(message);
  (error as Error & { status?: number }).status = status;
  return error;
}

class CampaignService {
  async list() {
    const campaigns = await prisma.campaign.findMany({
      include: { image: { select: safeMediaSelect }, _count: { select: { recipients: true } } },
      orderBy: { createdAt: "desc" }
    });
    if (!campaigns.length) return [];

    const campaignIds = campaigns.map((campaign) => campaign.id);
    const [groups, failures] = await Promise.all([
      prisma.campaignRecipient.groupBy({
        by: ["campaignId", "status"],
        where: { campaignId: { in: campaignIds } },
        _count: { _all: true }
      }),
      prisma.campaignRecipient.findMany({
        where: { campaignId: { in: campaignIds }, status: "FAILED" },
        orderBy: { lastAttemptAt: "desc" },
        take: 30,
        select: {
          campaignId: true,
          error: true,
          attempts: true,
          lastAttemptAt: true,
          lead: { select: { id: true, name: true, username: true } }
        }
      })
    ]);

    return campaigns.map((campaign) => ({
      ...campaign,
      progress: Object.fromEntries(
        groups
          .filter((row) => row.campaignId === campaign.id)
          .map((row) => [row.status.toLowerCase(), row._count._all])
      ),
      recentErrors: failures.filter((failure) => failure.campaignId === campaign.id).slice(0, 5)
    }));
  }

  async eligibleLeads(campaign: Pick<Campaign, "segment" | "sensitive">) {
    const segment = campaign.segment as Segment;
    const leads = await prisma.lead.findMany({
      where: {
        optInCommercial: true,
        status: { notIn: [...EXCLUDED_LEAD_STATUSES] },
        ...(segment.status ? { status: segment.status as Lead["status"] } : {}),
        ...(segment.source ? { source: segment.source } : {}),
        ...(segment.ageConfirmed === true ? { ageConfirmed: true } : {}),
        ...(segment.tagId ? { tags: { some: { tagId: segment.tagId } } } : {})
      },
      orderBy: { lastInteractionAt: "desc" }
    });

    return leads.filter((lead) =>
      canMessageLead(
        {
          status: lead.status,
          optInCommercial: lead.optInCommercial,
          ageConfirmed: lead.ageConfirmed,
          followUpAllowed: lead.followUpAllowed,
          userWroteFirst: lead.userWroteFirst,
          conversationActive: lead.conversationActive
        },
        "campaign",
        { sensitive: campaign.sensitive, commercial: true }
      ).allowed
    );
  }

  async preview(campaignId: string) {
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const leads = await this.eligibleLeads(campaign);
    return {
      count: leads.length,
      sample: leads.slice(0, 20).map((lead) => ({
        id: lead.id,
        name: lead.name,
        username: lead.username,
        status: lead.status
      }))
    };
  }

  async prepareRecipients(campaignId: string) {
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaignId },
      include: { image: true }
    });
    const leads = await this.eligibleLeads(campaign);
    if (!leads.length) {
      throw requestError("No hay destinatarios elegibles. Confirma opt-in, permiso de seguimiento y conversacion valida en Leads.");
    }
    if (campaign.imageId && (!campaign.image || campaign.image.deletedAt)) {
      throw requestError("La imagen de la campana no esta disponible. Quitala o sube otra antes de activar.");
    }

    const eligibleIds = leads.map((lead) => lead.id);
    const startAt = campaign.startAt && campaign.startAt > new Date() ? campaign.startAt : new Date();

    await prisma.campaignRecipient.updateMany({
      where: {
        campaignId,
        status: { in: ["PENDING", "PROCESSING"] },
        leadId: { notIn: eligibleIds }
      },
      data: { status: "SKIPPED", error: "El lead ya no cumple las reglas de consentimiento." }
    });
    await prisma.campaignRecipient.updateMany({
      where: { campaignId, status: "FAILED", leadId: { in: eligibleIds } },
      data: { status: "PENDING", attempts: 0, error: null, scheduledAt: startAt }
    });
    await prisma.campaignRecipient.createMany({
      data: leads.map((lead, index) => ({
        campaignId,
        leadId: lead.id,
        scheduledAt: new Date(startAt.getTime() + index * campaign.pauseSeconds * 1000)
      })),
      skipDuplicates: true
    });

    return prisma.campaignRecipient.count({ where: { campaignId, status: "PENDING" } });
  }

  async activate(campaignId: string) {
    const system = await systemService.status();
    if (!system.telegram.connected) {
      throw requestError(`Telegram no esta conectado. Estado actual: ${system.telegram.status}.`, 409);
    }
    if (!system.worker.online || system.worker.state === "ERROR") {
      const detail = system.worker.lastError ? ` Ultimo error: ${system.worker.lastError}` : "";
      throw requestError(`El servicio Worker esta apagado, con error o no comparte la misma DATABASE_URL.${detail}`, 503);
    }

    const count = await this.prepareRecipients(campaignId);
    if (count === 0) {
      throw requestError("La campana no tiene envios pendientes. Los destinatarios ya fueron enviados o excluidos.", 409);
    }

    const current = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const scheduled = Boolean(current.startAt && current.startAt > new Date());
    return prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: scheduled ? "SCHEDULED" : "ACTIVE",
        stats: toInputJson({
          preparedRecipients: count,
          pending: count,
          activatedAt: new Date().toISOString(),
          nextAllowedAt: null
        })
      }
    });
  }

  async pause(campaignId: string) {
    return prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
  }

  async cancelPending(campaignId: string) {
    await prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
    const cancelled = await prisma.campaignRecipient.updateMany({
      where: { campaignId, status: "PENDING" },
      data: { status: "SKIPPED", error: "Cancelado manualmente desde el CRM." }
    });
    return { ok: true, cancelled: cancelled.count };
  }
}

export const campaignService = new CampaignService();
