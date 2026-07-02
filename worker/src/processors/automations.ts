import type { Job } from "bullmq";
import { prisma } from "@crm/db";
import { createWorker } from "../queues";
import { sendToLead } from "../telegram";

type AutomationPayload = {
  text?: string;
  mediaAssetId?: string;
  status?: string;
  tag?: string;
  color?: string;
};

export function startAutomationWorker() {
  return createWorker("automations", async (job: Job<{ runId: string }>) => {
    const run = await prisma.automationRun.findUniqueOrThrow({
      where: { id: job.data.runId },
      include: { automation: true, lead: true }
    });
    if (run.status !== "SCHEDULED" || run.automation.status !== "ACTIVE") return;

    const payload = run.automation.actionPayload as AutomationPayload;
    try {
      switch (run.automation.action) {
        case "SEND_MESSAGE":
        case "ENVIAR_MENSAJE":
          await sendToLead({ leadId: run.leadId, text: payload.text, sensitive: run.automation.sensitive, intent: "follow_up" });
          break;
        case "SEND_IMAGE":
        case "ENVIAR_IMAGEN":
          await sendToLead({ leadId: run.leadId, mediaAssetId: payload.mediaAssetId, sensitive: run.automation.sensitive, intent: "follow_up" });
          break;
        case "SEND_MESSAGE_IMAGE":
        case "ENVIAR_MENSAJE_IMAGEN":
          await sendToLead({ leadId: run.leadId, text: payload.text, mediaAssetId: payload.mediaAssetId, sensitive: run.automation.sensitive, intent: "follow_up" });
          break;
        case "CHANGE_STATUS":
        case "CAMBIAR_ESTADO":
          await prisma.lead.update({ where: { id: run.leadId }, data: { status: payload.status as never } });
          break;
        case "ADD_TAG":
        case "ANADIR_ETIQUETA": {
          const tag = await prisma.tag.upsert({
            where: { name: payload.tag ?? "automatizado" },
            update: {},
            create: { name: payload.tag ?? "automatizado", color: payload.color ?? "#0f766e" }
          });
          await prisma.leadTag.upsert({
            where: { leadId_tagId: { leadId: run.leadId, tagId: tag.id } },
            update: {},
            create: { leadId: run.leadId, tagId: tag.id }
          });
          break;
        }
        case "STOP_AI":
        case "DETENER_IA":
          await prisma.lead.update({ where: { id: run.leadId }, data: { aiEnabled: false } });
          break;
        case "STOP_AUTOMATIONS":
        case "DETENER_AUTOMATIZACIONES":
          await prisma.automationRun.updateMany({
            where: { leadId: run.leadId, status: "SCHEDULED", id: { not: run.id } },
            data: { status: "CANCELLED" }
          });
          break;
        default:
          throw new Error(`Accion no soportada: ${run.automation.action}`);
      }

      await prisma.automationRun.update({
        where: { id: run.id },
        data: { status: "EXECUTED", executedAt: new Date() }
      });
      await prisma.auditLog.create({
        data: {
          action: "AUTOMATION_EXECUTED",
          entityType: "AutomationRun",
          entityId: run.id,
          metadata: { automationId: run.automationId, leadId: run.leadId }
        }
      });
    } catch (error) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: { status: "FAILED", error: error instanceof Error ? error.message : "Error desconocido" }
      });
    }
  });
}
