import { prisma } from "@crm/db";
import { sendToLead } from "../telegram";

type AutomationPayload = {
  text?: string;
  mediaAssetId?: string;
  status?: string;
  tag?: string;
  color?: string;
};

async function executeAutomationRun(runId: string) {
  const run = await prisma.automationRun.findUniqueOrThrow({
    where: { id: runId },
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
      case "REMOVE_TAG":
      case "QUITAR_ETIQUETA": {
        if (!payload.tag) throw new Error("Falta el nombre de la etiqueta a quitar");
        const tag = await prisma.tag.findUnique({ where: { name: payload.tag } });
        if (tag) {
          await prisma.leadTag.deleteMany({ where: { leadId: run.leadId, tagId: tag.id } });
        }
        break;
      }
      case "CREATE_INTERNAL_TASK":
      case "CREAR_TAREA_INTERNA": {
        const conversation = await prisma.conversation.findFirst({ where: { leadId: run.leadId } });
        if (!conversation) throw new Error("El lead no tiene conversacion para crear la tarea interna");
        await prisma.message.create({
          data: {
            conversationId: conversation.id,
            leadId: run.leadId,
            direction: "INTERNAL",
            status: "RECEIVED",
            body: payload.text || `Tarea creada por automatizacion: ${run.automation.name}`
          }
        });
        break;
      }
      case "NOTIFY_ADMIN":
      case "NOTIFICAR_ADMIN":
        await prisma.auditLog.create({
          data: {
            action: "ADMIN_NOTIFICATION_CREATED",
            entityType: "Lead",
            entityId: run.leadId,
            metadata: { automationId: run.automationId, message: payload.text ?? run.automation.name }
          }
        });
        break;
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
    const message = error instanceof Error ? error.message : "Error desconocido";
    await prisma.automationRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: message }
    });
    await prisma.auditLog.create({
      data: {
        action: "AUTOMATION_FAILED",
        entityType: "AutomationRun",
        entityId: run.id,
        metadata: { automationId: run.automationId, leadId: run.leadId, error: message }
      }
    });
  }
}

export async function pollAutomations() {
  const runs = await prisma.automationRun.findMany({
    where: { status: "SCHEDULED", scheduledFor: { lte: new Date() } },
    orderBy: { scheduledFor: "asc" },
    take: 20
  });

  for (const run of runs) {
    await executeAutomationRun(run.id);
  }
}
