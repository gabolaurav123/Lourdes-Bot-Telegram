import { config } from "../config";
import { prisma } from "../lib/prisma";

type StoredWorkerStatus = {
  state?: string;
  startedAt?: string;
  updatedAt?: string;
  lastSuccessAt?: string;
  lastError?: string | null;
};

class SystemService {
  async status() {
    const [workerSetting, telegram, aiConfig, lastAiEvent, lastAiReply] = await Promise.all([
      prisma.setting.findUnique({ where: { key: "worker:status" } }),
      prisma.telegramSession.findUnique({ where: { label: config.telegram.sessionLabel } }),
      prisma.aiConfig.findUnique({ where: { id: "default" } }),
      prisma.auditLog.findFirst({
        where: { action: { in: ["AI_REPLY_SENT", "AI_REPLY_SKIPPED", "AI_REPLY_FAILED"] } },
        orderBy: { createdAt: "desc" }
      }),
      prisma.message.findFirst({
        where: { aiGenerated: true, status: "SENT" },
        orderBy: { sentAt: "desc" },
        select: { sentAt: true }
      })
    ]);

    const worker = (workerSetting?.value ?? {}) as StoredWorkerStatus;
    const updatedAt = worker.updatedAt ? new Date(worker.updatedAt) : null;
    const online = Boolean(updatedAt && Date.now() - updatedAt.getTime() < 60_000);

    return {
      worker: {
        online,
        state: online ? worker.state ?? "RUNNING" : "OFFLINE",
        startedAt: worker.startedAt ?? null,
        updatedAt: worker.updatedAt ?? null,
        lastSuccessAt: worker.lastSuccessAt ?? null,
        lastError: worker.lastError ?? null
      },
      telegram: {
        configured: Boolean(config.telegram.apiId && config.telegram.apiHash),
        connected: telegram?.status === "CONNECTED" && Boolean(telegram.encryptedSession),
        status: telegram?.status ?? "DISCONNECTED",
        lastError: telegram?.lastError ?? null
      },
      openai: {
        configured: Boolean(aiConfig?.encryptedApiKey || config.openai.apiKey),
        enabled: aiConfig?.globalEnabled ?? false,
        model: aiConfig?.model ?? config.openai.model,
        lastReplyAt: lastAiReply?.sentAt ?? null,
        lastEvent: lastAiEvent
          ? {
              action: lastAiEvent.action,
              at: lastAiEvent.createdAt,
              detail: typeof lastAiEvent.metadata === "object" && lastAiEvent.metadata
                ? String((lastAiEvent.metadata as Record<string, unknown>).error ?? (lastAiEvent.metadata as Record<string, unknown>).reason ?? "")
                : ""
            }
          : null
      }
    };
  }
}

export const systemService = new SystemService();
