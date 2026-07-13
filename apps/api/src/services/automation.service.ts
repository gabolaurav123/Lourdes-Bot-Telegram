import { canMessageLead, isLeadExcluded } from "@crm/shared";
import { toInputJson } from "../lib/json";
import { prisma } from "../lib/prisma";

class AutomationService {
  async scheduleForTrigger(trigger: string, leadId: string, payload: Record<string, unknown> = {}) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { tags: true } });
    if (!lead) return [];
    if (isLeadExcluded(lead)) return [];

    const automations = await prisma.automation.findMany({
      where: { trigger, status: "ACTIVE" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
    });

    const scheduled = [];
    for (const automation of automations) {
      const conditions = { ...(automation.segment as Record<string, unknown>), ...(automation.conditions as Record<string, unknown>) };
      if (conditions.status && conditions.status !== lead.status) continue;
      if (conditions.source && conditions.source !== lead.source) continue;
      if (conditions.optInCommercial === true && !lead.optInCommercial) continue;
      if (conditions.ageConfirmed === true && !lead.ageConfirmed) continue;
      if (conditions.followUpAllowed === true && !lead.followUpAllowed) continue;
      if (conditions.tagId && !lead.tags.some((tag) => tag.tagId === conditions.tagId)) continue;

      const sendsMessage = automation.action.includes("SEND") || automation.action.includes("ENVIAR");
      if (sendsMessage) {
        const permission = canMessageLead(
          {
            status: lead.status,
            optInCommercial: lead.optInCommercial,
            ageConfirmed: lead.ageConfirmed,
            followUpAllowed: lead.followUpAllowed,
            userWroteFirst: lead.userWroteFirst,
            conversationActive: lead.conversationActive
          },
          "follow_up",
          { sensitive: automation.sensitive, commercial: true }
        );
        if (!permission.allowed) continue;
      }

      const executionCount = await prisma.automationRun.count({ where: { automationId: automation.id, leadId } });
      if (executionCount >= automation.executionLimit) continue;

      if (!automation.allowRepeat) {
        if (executionCount > 0) continue;
      }

      const scheduledFor = new Date(Date.now() + automation.delaySeconds * 1000);
      const run = await prisma.automationRun.create({
        data: {
          automationId: automation.id,
          leadId,
          scheduledFor,
          payload: toInputJson(payload)
        }
      });
      scheduled.push(run);
    }

    return scheduled;
  }

  async cancelPendingForLead(leadId: string) {
    return prisma.automationRun.updateMany({
      where: { leadId, status: "SCHEDULED" },
      data: { status: "CANCELLED", error: "Cancelado por cambio de estado o compra" }
    });
  }
}

export const automationService = new AutomationService();
