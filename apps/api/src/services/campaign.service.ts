import type { Campaign, Lead } from "@prisma/client";
import { EXCLUDED_LEAD_STATUSES, canMessageLead } from "@crm/shared";
import { toInputJson } from "../lib/json";
import { prisma } from "../lib/prisma";
import { campaignQueue } from "./queues";

type Segment = {
  status?: string;
  source?: string;
  tagId?: string;
  ageConfirmed?: boolean;
  optInCommercial?: boolean;
};

class CampaignService {
  async eligibleLeads(campaign: Pick<Campaign, "segment" | "sensitive">) {
    const segment = campaign.segment as Segment;
    const leads = await prisma.lead.findMany({
      where: {
        optInCommercial: true,
        status: { notIn: [...EXCLUDED_LEAD_STATUSES] },
        ...(segment.status ? { status: segment.status as Lead["status"] } : {}),
        ...(segment.source ? { source: segment.source } : {}),
        ...(segment.ageConfirmed === true ? { ageConfirmed: true } : {}),
        ...(segment.tagId
          ? {
              tags: {
                some: {
                  tagId: segment.tagId
                }
              }
            }
          : {})
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
    const campaign = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
    const leads = await this.eligibleLeads(campaign);

    for (const lead of leads) {
      await prisma.campaignRecipient.upsert({
        where: { campaignId_leadId: { campaignId, leadId: lead.id } },
        update: {},
        create: {
          campaignId,
          leadId: lead.id,
          scheduledAt: campaign.startAt ?? new Date()
        }
      });
    }

    return leads.length;
  }

  async activate(campaignId: string) {
    const count = await this.prepareRecipients(campaignId);
    const campaign = await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: "ACTIVE",
        stats: toInputJson({ preparedRecipients: count })
      }
    });
    await campaignQueue.add("run-campaign", { campaignId }, { jobId: `campaign:${campaignId}`, removeOnComplete: true });
    return campaign;
  }

  async pause(campaignId: string) {
    return prisma.campaign.update({ where: { id: campaignId }, data: { status: "PAUSED" } });
  }
}

export const campaignService = new CampaignService();
