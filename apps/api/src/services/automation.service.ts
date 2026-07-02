import { canMessageLead } from "@crm/shared";
import { toInputJson } from "../lib/json";
import { prisma } from "../lib/prisma";
import { automationQueue } from "./queues";

class AutomationService {
  async scheduleForTrigger(trigger: string, leadId: string, payload: Record<string, unknown> = {}) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return [];

    const automations = await prisma.automation.findMany({
      where: { trigger, status: "ACTIVE" },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }]
    });

    const scheduled = [];
    for (const automation of automations) {
      const permission = canMessageLead(
        {
          status: lead.status,
          optInCommercial: lead.optInCommercial,
          ageConfirmed: lead.ageConfirmed,
          followUpAllowed: lead.followUpAllowed,
          userWroteFirst: lead.userWroteFirst,
          conversationActive: lead.conversationActive
        },
        automation.action.includes("SEND") ? "follow_up" : "manual_reply",
        { sensitive: automation.sensitive, commercial: true }
      );

      if (!permission.allowed) continue;

      if (!automation.allowRepeat) {
        const existing = await prisma.automationRun.findFirst({
          where: { automationId: automation.id, leadId }
        });
        if (existing) continue;
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
      await automationQueue.add(
        "run-automation",
        { runId: run.id },
        { delay: Math.max(0, scheduledFor.getTime() - Date.now()), jobId: `automation:${run.id}`, removeOnComplete: true }
      );
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
