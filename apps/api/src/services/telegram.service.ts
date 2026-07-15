import path from "node:path";
import QRCode from "qrcode";
import { Api, TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { NewMessage, type NewMessageEvent } from "telegram/events";
import { StringSession } from "telegram/sessions";
import type { ConversationType, Lead, MessageStatus } from "@prisma/client";
import { confirmsAdultAge, containsStopPhrase, isLegacyFalseStop } from "@crm/shared";
import { config } from "../config";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { prisma } from "../lib/prisma";
import { sanitizeText } from "../lib/sanitize";
import { assertCanMessageLead } from "./permission.service";
import { aiService } from "./ai.service";
import { automationService } from "./automation.service";
import { mediaService } from "./media.service";

type DialogLike = {
  id?: unknown;
  name?: string;
  title?: string;
  message?: { message?: string; date?: number; out?: boolean };
  entity?: Record<string, unknown>;
  inputEntity?: unknown;
};

type TelegramTarget = Parameters<TelegramClient["sendMessage"]>[0];

function telegramId(value: unknown) {
  if (typeof value === "object" && value && "value" in value) {
    return String((value as { value: unknown }).value);
  }
  return value === undefined || value === null ? "" : String(value);
}

type IncomingMediaRecord = {
  className?: string;
  photo?: unknown;
  document?: {
    mimeType?: string;
    attributes?: Array<{ fileName?: string }>;
  };
};

class TelegramService {
  private client?: TelegramClient;
  private loginPromise?: Promise<unknown>;
  private readonly entityCache = new Map<string, TelegramTarget>();
  private readonly aiReplyLocks = new Set<string>();
  private readonly aiReplyTimers = new Map<string, ReturnType<typeof setTimeout>>();

  private ensureConfig() {
    if (!config.telegram.apiId || !config.telegram.apiHash) {
      const error = new Error("TELEGRAM_API_ID y TELEGRAM_API_HASH son requeridos");
      (error as Error & { status?: number }).status = 400;
      throw error;
    }
  }

  private buildClient(session = "") {
    return new TelegramClient(new StringSession(session), config.telegram.apiId, config.telegram.apiHash, {
      connectionRetries: 5
    });
  }

  async status() {
    const session = await prisma.telegramSession.upsert({
      where: { label: config.telegram.sessionLabel },
      update: {},
      create: { label: config.telegram.sessionLabel, status: "DISCONNECTED" }
    });

    return {
      label: session.label,
      status: session.status,
      phone: session.phone,
      username: session.username,
      displayName: session.displayName,
      qrCodeDataUrl: session.qrCodeDataUrl,
      qrExpiresAt: session.qrExpiresAt,
      lastError: session.lastError,
      connectedAt: session.connectedAt,
      disconnectedAt: session.disconnectedAt
    };
  }

  async startQrLogin() {
    this.ensureConfig();
    if (this.loginPromise) return this.status();

    const session = await prisma.telegramSession.upsert({
      where: { label: config.telegram.sessionLabel },
      update: { status: "QR_PENDING", lastError: null },
      create: { label: config.telegram.sessionLabel, status: "QR_PENDING" }
    });

    const client = this.buildClient("");
    this.client = client;
    await client.connect();

    this.loginPromise = (client as unknown as {
      signInUserWithQrCode: (
        credentials: { apiId: number; apiHash: string },
        params: {
          qrCode: (qrCode: { token: Buffer; expires: number }) => Promise<void>;
          password?: () => Promise<string>;
          onError: (error: Error) => void | boolean | Promise<void | boolean>;
        }
      ) => Promise<Api.TypeUser>;
    }).signInUserWithQrCode(
      { apiId: config.telegram.apiId, apiHash: config.telegram.apiHash },
      {
        qrCode: async ({ token, expires }) => {
          const qrUrl = `tg://login?token=${token.toString("base64url")}`;
          const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, { width: 320, margin: 1 });
          await prisma.telegramSession.update({
            where: { id: session.id },
            data: {
              status: "QR_PENDING",
              qrCodeDataUrl,
              qrExpiresAt: new Date(expires * 1000),
              lastError: null
            }
          });
        },
        password: async () => {
          if (process.env.TELEGRAM_2FA_PASSWORD) return process.env.TELEGRAM_2FA_PASSWORD;
          throw new Error("La cuenta tiene 2FA. Configura TELEGRAM_2FA_PASSWORD temporalmente para completar el QR.");
        },
        onError: async (error) => {
          await prisma.telegramSession.update({
            where: { id: session.id },
            data: { status: "ERROR", lastError: error.message }
          });
          return false;
        }
      }
    )
      .then(async (user) => {
        const sessionString = (client.session as StringSession).save();
        await prisma.telegramSession.update({
          where: { id: session.id },
          data: {
            status: "CONNECTED",
            encryptedSession: encryptSecret(sessionString),
            qrCodeDataUrl: null,
            qrExpiresAt: null,
            phone: "phone" in user ? String(user.phone ?? "") : undefined,
            username: "username" in user ? String(user.username ?? "") : undefined,
            displayName: [("firstName" in user ? user.firstName : ""), ("lastName" in user ? user.lastName : "")]
              .filter(Boolean)
              .join(" "),
            connectedAt: new Date(),
            disconnectedAt: null,
            lastError: null
          }
        });
        this.attachIncomingHandler(client);
        await this.syncDialogs(config.telegram.syncLimit);
      })
      .catch(async (error: Error) => {
        await prisma.telegramSession.update({
          where: { id: session.id },
          data: { status: "ERROR", lastError: error.message }
        });
      })
      .finally(() => {
        this.loginPromise = undefined;
      });

    return this.status();
  }

  async restoreConnectedSession() {
    this.ensureConfig();
    const session = await prisma.telegramSession.findUnique({ where: { label: config.telegram.sessionLabel } });
    const saved = decryptSecret(session?.encryptedSession);
    if (!saved) return;

    const client = this.buildClient(saved);
    await client.connect();
    const authorized = await client.checkAuthorization();
    if (!authorized) {
      await prisma.telegramSession.update({
        where: { label: config.telegram.sessionLabel },
        data: { status: "EXPIRED", lastError: "Sesion expirada" }
      });
      return;
    }

    this.client = client;
    this.attachIncomingHandler(client);
    await prisma.telegramSession.update({
      where: { label: config.telegram.sessionLabel },
      data: { status: "CONNECTED", connectedAt: new Date(), lastError: null }
    });
  }

  async logout() {
    for (const timer of this.aiReplyTimers.values()) clearTimeout(timer);
    this.aiReplyTimers.clear();
    if (this.client) {
      await this.client.disconnect();
      this.client = undefined;
    }

    await prisma.telegramSession.update({
      where: { label: config.telegram.sessionLabel },
      data: {
        status: "DISCONNECTED",
        encryptedSession: null,
        qrCodeDataUrl: null,
        qrExpiresAt: null,
        disconnectedAt: new Date()
      }
    });
  }

  async resetCrmData() {
    await this.logout().catch(() => undefined);

    const [
      campaignRecipients,
      automationRuns,
      messages,
      purchases,
      leadTags,
      conversations,
      leads,
      campaigns,
      automations
    ] = await prisma.$transaction([
      prisma.campaignRecipient.deleteMany(),
      prisma.automationRun.deleteMany(),
      prisma.message.deleteMany(),
      prisma.purchase.deleteMany(),
      prisma.leadTag.deleteMany(),
      prisma.conversation.deleteMany(),
      prisma.lead.deleteMany(),
      prisma.campaign.deleteMany(),
      prisma.automation.deleteMany()
    ]);

    await prisma.telegramSession.upsert({
      where: { label: config.telegram.sessionLabel },
      update: {
        status: "DISCONNECTED",
        encryptedSession: null,
        qrCodeDataUrl: null,
        qrExpiresAt: null,
        phone: null,
        username: null,
        displayName: null,
        lastError: null,
        disconnectedAt: new Date()
      },
      create: {
        label: config.telegram.sessionLabel,
        status: "DISCONNECTED",
        disconnectedAt: new Date()
      }
    });

    return {
      ok: true,
      deleted: {
        campaignRecipients: campaignRecipients.count,
        automationRuns: automationRuns.count,
        messages: messages.count,
        purchases: purchases.count,
        leadTags: leadTags.count,
        conversations: conversations.count,
        leads: leads.count,
        campaigns: campaigns.count,
        automations: automations.count
      }
    };
  }

  async syncDialogs(limit = 100) {
    const client = await this.requireClient();
    const dialogs = (await client.getDialogs({ limit })) as unknown as DialogLike[];
    let count = 0;

    for (const dialog of dialogs) {
      this.rememberDialogEntity(dialog);
      await this.upsertDialog(dialog);
      count += 1;
    }

    const repairedFalseStops = await this.repairLegacyFalseStops();

    return { count, repairedFalseStops };
  }

  async repairLegacyFalseStops() {
    const stoppedLeads = await prisma.lead.findMany({
      where: {
        status: "NO_VOLVER_A_ESCRIBIR",
        lastInboundMessage: { not: null },
        isGroup: false,
        isChannel: false
      },
      select: {
        id: true,
        lastInboundMessage: true,
        messages: {
          where: { direction: "INBOUND" },
          orderBy: { createdAt: "desc" },
          take: 100,
          select: { body: true }
        }
      }
    });
    if (!stoppedLeads.length) return 0;

    const manualStopLogs = await prisma.auditLog.findMany({
      where: {
        action: "LEAD_UPDATED",
        entityType: "Lead",
        entityId: { in: stoppedLeads.map((lead) => lead.id) }
      },
      select: { entityId: true, metadata: true }
    });
    const manuallyStopped = new Set(
      manualStopLogs
        .filter((log) => {
          const metadata = log.metadata as Record<string, unknown>;
          return metadata.status === "NO_VOLVER_A_ESCRIBIR";
        })
        .map((log) => log.entityId)
        .filter((id): id is string => Boolean(id))
    );
    const candidates = stoppedLeads.filter((lead) => {
      if (manuallyStopped.has(lead.id)) return false;
      const inboundTexts = [lead.lastInboundMessage, ...lead.messages.map((message) => message.body)]
        .filter((text): text is string => Boolean(text));
      if (inboundTexts.some((text) => containsStopPhrase(text))) return false;
      return inboundTexts.some((text) => isLegacyFalseStop(text));
    });
    if (!candidates.length) return 0;

    const repairedAt = new Date().toISOString();
    await prisma.$transaction([
      prisma.lead.updateMany({
        where: { id: { in: candidates.map((lead) => lead.id) }, status: "NO_VOLVER_A_ESCRIBIR" },
        data: {
          status: "RESPONDIO",
          aiEnabled: true,
          userWroteFirst: true,
          conversationActive: true
        }
      }),
      prisma.auditLog.createMany({
        data: candidates.map((lead) => ({
          action: "LEGACY_FALSE_STOP_REPAIRED",
          entityType: "Lead",
          entityId: lead.id,
          metadata: { repairedAt }
        }))
      })
    ]);

    return candidates.length;
  }

  async sendMessageFromPanel(input: {
    conversationId: string;
    text?: string;
    mediaAssetId?: string;
    actorId?: string;
    sensitive?: boolean;
    aiGenerated?: boolean;
    intent?: "manual_reply" | "ai_reply" | "follow_up" | "campaign";
  }) {
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { id: input.conversationId },
      include: { lead: true }
    });
    if (!conversation.lead) throw new Error("La conversacion no tiene lead asociado");

    assertCanMessageLead(conversation.lead, input.intent ?? "manual_reply", {
      sensitive: input.sensitive,
      commercial: input.intent === "campaign" || input.intent === "follow_up"
    });

    const client = await this.requireClient();
    const target = await this.resolveEntity(client, conversation.telegramChatId);
    const media = input.mediaAssetId
      ? await prisma.mediaAsset.findUniqueOrThrow({ where: { id: input.mediaAssetId } })
      : null;

    let status: MessageStatus = "SENT";
    let telegramMessageId: string | undefined;
    let error: string | undefined;

    try {
      if (media) {
        const file = media.content
          ? new CustomFile(media.filename, media.content.length, "", Buffer.from(media.content))
          : media.storage === "local"
            ? path.resolve(config.media.localDir, media.filename)
            : media.url;
        const sent = await client.sendFile(target, {
          file,
          caption: input.text
        });
        telegramMessageId = String((sent as { id?: unknown }).id ?? "");
      } else {
        const sent = await client.sendMessage(target, {
          message: input.text ?? ""
        });
        telegramMessageId = String((sent as { id?: unknown }).id ?? "");
      }
    } catch (sendError) {
      status = "FAILED";
      error = sendError instanceof Error ? sendError.message : "Error de envio";
    }

    const message = await prisma.message.create({
      data: {
        telegramMessageId,
        conversationId: conversation.id,
        leadId: conversation.lead.id,
        direction: "OUTBOUND",
        status,
        body: input.text,
        mediaAssetId: input.mediaAssetId,
        aiGenerated: input.aiGenerated ?? false,
        sensitive: input.sensitive ?? false,
        sentById: input.actorId,
        sentAt: status === "SENT" ? new Date() : undefined,
        error
      }
    });

    await prisma.lead.update({
      where: { id: conversation.lead.id },
      data: {
        lastOutboundMessage: input.text,
        lastInteractionAt: new Date(),
        conversationActive: true
      }
    });
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        responded: status === "SENT",
        conversationActive: true,
        lastMessage: input.text ?? "[imagen]",
        lastMessageAt: new Date()
      }
    });

    if (status === "FAILED") {
      const err = new Error(error);
      (err as Error & { status?: number }).status = 502;
      throw err;
    }

    return message;
  }

  async sendCampaignToLead(lead: Lead, text: string, mediaAssetId?: string, sensitive = false) {
    if (!lead.telegramChatId) throw new Error("Lead sin telegramChatId");
    const conversation = await prisma.conversation.findUniqueOrThrow({
      where: { telegramChatId: lead.telegramChatId }
    });
    return this.sendMessageFromPanel({
      conversationId: conversation.id,
      text,
      mediaAssetId,
      sensitive,
      intent: "campaign"
    });
  }

  async retryIncomingMedia(messageId: string) {
    const stored = await prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      include: { conversation: true, mediaAsset: true }
    });
    if (stored.direction !== "INBOUND") throw new Error("Solo se pueden recuperar imagenes recibidas");
    const currentMediaAvailable = Boolean(
      stored.mediaAsset &&
      !stored.mediaAsset.deletedAt &&
      (!stored.mediaAsset.expiresAt || stored.mediaAsset.expiresAt > new Date()) &&
      (stored.mediaAsset.storage !== "database" || stored.mediaAsset.content)
    );
    if (stored.mediaAssetId && currentMediaAvailable) return { ok: true, mediaAssetId: stored.mediaAssetId };
    if (!stored.telegramMessageId) throw new Error("El mensaje no tiene un ID de Telegram para recuperar la imagen");

    const telegramMessageId = Number(stored.telegramMessageId);
    if (!Number.isInteger(telegramMessageId)) throw new Error("El ID del mensaje de Telegram no es valido");

    const client = await this.requireClient();
    const target = await this.resolveEntity(client, stored.conversation.telegramChatId);
    const remoteMessages = await client.getMessages(target, { ids: [telegramMessageId] });
    const remoteMessage = remoteMessages[0];
    if (!remoteMessage) throw new Error("Telegram ya no devolvio el mensaje original");

    const mediaAsset = await this.saveIncomingImage(client, remoteMessage as unknown as NewMessageEvent["message"]);
    if (!mediaAsset) throw new Error("El mensaje no contiene una imagen compatible");

    await prisma.message.update({
      where: { id: stored.id },
      data: { mediaAssetId: mediaAsset.id, error: null }
    });
    return { ok: true, mediaAssetId: mediaAsset.id };
  }

  private attachIncomingHandler(client: TelegramClient) {
    client.addEventHandler((event) => {
      void this.handleIncoming(event as NewMessageEvent).catch(async (error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error("Incoming Telegram message failed:", message);
        await prisma.auditLog.create({
          data: {
            action: "INCOMING_MESSAGE_PROCESSING_FAILED",
            entityType: "TelegramSession",
            metadata: { error: message }
          }
        }).catch(() => undefined);
      });
    }, new NewMessage({ incoming: true }));
  }

  private async handleIncoming(event: NewMessageEvent) {
    const message = event.message;
    if (!message.isPrivate) return;
    const chatId = String(message.chatId?.valueOf?.() ?? message.peerId?.className ?? "");
    if (!chatId) return;

    const text = sanitizeText(message.message ?? "");
    const activeClient = await this.requireClient();
    const expectsImage = this.isIncomingImage(message);
    let mediaAsset: Awaited<ReturnType<typeof mediaService.saveBuffer>> | null = null;
    let mediaError: string | undefined;
    if (expectsImage) {
      try {
        mediaAsset = await this.saveIncomingImage(activeClient, message);
        if (!mediaAsset) mediaError = "Telegram no devolvio datos de la imagen";
      } catch (error) {
        mediaError = error instanceof Error ? error.message : String(error);
        await prisma.auditLog.create({
          data: {
            action: "INCOMING_MEDIA_FAILED",
            entityType: "TelegramMessage",
            entityId: String(message.id),
            metadata: { chatId, error: mediaError }
          }
        }).catch(() => undefined);
      }
    }
    const conversation = await prisma.conversation.upsert({
      where: { telegramChatId: chatId },
      update: {
        lastMessage: text || (expectsImage ? "[imagen]" : "[media]"),
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
        responded: false,
        userWroteFirst: true,
        conversationActive: true
      },
      create: {
        telegramChatId: chatId,
        name: chatId,
        type: "PRIVATE",
        lastMessage: text || (expectsImage ? "[imagen]" : "[media]"),
        lastMessageAt: new Date(),
        unreadCount: 1,
        userWroteFirst: true,
        conversationActive: true
      },
      include: { lead: true }
    });

    const lead = await this.ensureLeadForConversation(conversation.id, chatId, conversation.name, text);

    await prisma.message.create({
      data: {
        telegramMessageId: String(message.id),
        conversationId: conversation.id,
        leadId: lead.id,
        direction: "INBOUND",
        status: "RECEIVED",
        body: text,
        mediaAssetId: mediaAsset?.id,
        error: mediaError,
        receivedAt: new Date()
      }
    });

    if (containsStopPhrase(text)) {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "NO_VOLVER_A_ESCRIBIR", aiEnabled: false, followUpAllowed: false }
      });
      await automationService.cancelPendingForLead(lead.id);
      return;
    }

    if (lead.status === "NO_VOLVER_A_ESCRIBIR") {
      await prisma.lead.update({
        where: { id: lead.id },
        data: { status: "RESPONDIO", aiEnabled: true, userWroteFirst: true, conversationActive: true }
      });
      await prisma.auditLog.create({
        data: {
          action: "LEAD_REENGAGED_FROM_INBOUND",
          entityType: "Lead",
          entityId: lead.id,
          metadata: { conversationId: conversation.id }
        }
      });
    }

    await automationService.scheduleForTrigger("NEW_MESSAGE_RECEIVED", lead.id, { text });

    this.scheduleLiveAiReply(conversation.id);
  }

  private scheduleLiveAiReply(conversationId: string, delayMs = 2_000) {
    const existing = this.aiReplyTimers.get(conversationId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.aiReplyTimers.delete(conversationId);
      void this.replyToLatestPendingInbound(conversationId, true).then((result) => {
        if (result === "locked") this.scheduleLiveAiReply(conversationId, delayMs);
      });
    }, delayMs);
    this.aiReplyTimers.set(conversationId, timer);
  }

  private async replyToLatestPendingInbound(conversationId: string, auditSkipped: boolean) {
    if (this.aiReplyLocks.has(conversationId)) return "locked" as const;
    this.aiReplyLocks.add(conversationId);

    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          lead: true,
          messages: {
            where: { direction: { in: ["INBOUND", "OUTBOUND"] } },
            orderBy: { createdAt: "desc" },
            take: 30
          }
        }
      });
      if (!conversation?.lead || conversation.type !== "PRIVATE") return "not_pending" as const;

      const latestInbound = conversation.messages.find((message) => message.direction === "INBOUND");
      if (!latestInbound) return "not_pending" as const;
      const sentAfterInbound = conversation.messages.find(
        (message) => message.direction === "OUTBOUND" && message.status === "SENT" && message.createdAt > latestInbound.createdAt
      );
      if (sentAfterInbound) {
        if (!sentAfterInbound.aiGenerated) return "not_pending" as const;
        const replyLogs = await prisma.auditLog.findMany({
          where: { action: "AI_REPLY_SENT", entityType: "Lead", entityId: conversation.lead.id },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { metadata: true }
        });
        const matchedLog = replyLogs.find((log) => {
          const metadata = log.metadata as Record<string, unknown>;
          return metadata.outboundMessageId === sentAfterInbound.id;
        });
        if (!matchedLog) return "not_pending" as const;
        const metadata = matchedLog.metadata as Record<string, unknown>;
        if (metadata.inboundMessageId === latestInbound.id) return "not_pending" as const;
      }

      const inboundText = latestInbound.body ?? "[imagen]";
      if (containsStopPhrase(inboundText)) return "not_pending" as const;

      let lead = conversation.lead;
      if (!lead.ageConfirmed) {
        const previousOutbound = conversation.messages.find(
          (message) => message.direction === "OUTBOUND" && message.createdAt < latestInbound.createdAt
        );
        if (confirmsAdultAge(inboundText, previousOutbound?.body ?? "")) {
          lead = await prisma.lead.update({
            where: { id: lead.id },
            data: { ageConfirmed: true }
          });
          await prisma.auditLog.create({
            data: {
              action: "LEAD_AGE_CONFIRMED_FROM_REPLY",
              entityType: "Lead",
              entityId: lead.id,
              metadata: { conversationId }
            }
          });
          await automationService.scheduleForTrigger("AGE_CONFIRMED", lead.id);
        }
      }

      const failedReply = conversation.messages.find(
        (message) => message.direction === "OUTBOUND" && message.aiGenerated && message.status === "FAILED" && message.createdAt > latestInbound.createdAt
      );
      const generated = failedReply?.body
        ? { text: failedReply.body, reason: undefined }
        : await aiService.generateReply(lead, conversation, inboundText);
      if (!generated.text) {
        if (auditSkipped) {
          await prisma.auditLog.create({
            data: {
              action: "AI_REPLY_SKIPPED",
              entityType: "Lead",
              entityId: lead.id,
              metadata: { conversationId, reason: generated.reason ?? "Sin respuesta" }
            }
          });
        }
        return "skipped" as const;
      }

      const [newestInbound, alreadyAnswered] = await Promise.all([
        prisma.message.findFirst({
          where: { conversationId, direction: "INBOUND" },
          orderBy: { createdAt: "desc" },
          select: { id: true }
        }),
        prisma.message.findFirst({
          where: {
            conversationId,
            direction: "OUTBOUND",
            status: "SENT",
            createdAt: { gt: latestInbound.createdAt }
          },
          orderBy: { createdAt: "desc" },
          select: { id: true, aiGenerated: true }
        })
      ]);
      if (newestInbound?.id !== latestInbound.id) return "not_pending" as const;
      if (alreadyAnswered && !alreadyAnswered.aiGenerated) return "not_pending" as const;

      const outbound = await this.sendMessageFromPanel({
        conversationId,
        text: generated.text,
        aiGenerated: true,
        intent: "ai_reply"
      });
      await prisma.auditLog.create({
        data: {
          action: "AI_REPLY_SENT",
          entityType: "Lead",
          entityId: lead.id,
          metadata: {
            conversationId,
            inboundMessageId: latestInbound.id,
            outboundMessageId: outbound.id,
            pendingSweep: !auditSkipped
          }
        }
      });
      const newestInboundAfterSend = await prisma.message.findFirst({
        where: { conversationId, direction: "INBOUND" },
        orderBy: { createdAt: "desc" },
        select: { id: true }
      });
      if (newestInboundAfterSend?.id !== latestInbound.id) {
        await prisma.conversation.update({ where: { id: conversationId }, data: { responded: false } });
      }
      return "sent" as const;
    } catch (error) {
      const errorText = error instanceof Error ? error.message : String(error);
      await prisma.auditLog.create({
        data: {
          action: "AI_REPLY_FAILED",
          entityType: "Conversation",
          entityId: conversationId,
          metadata: { conversationId, error: errorText, pendingSweep: !auditSkipped }
        }
      }).catch(() => undefined);
      return "failed" as const;
    } finally {
      this.aiReplyLocks.delete(conversationId);
    }
  }

  private isIncomingImage(message: NewMessageEvent["message"]) {
    const media = (message as unknown as { media?: unknown }).media;
    if (!media) return false;

    const mediaRecord = media as IncomingMediaRecord;
    const mimeType = mediaRecord.document?.mimeType ?? "";
    return Boolean(
      mimeType.startsWith("image/") ||
      String(mediaRecord.className ?? "").includes("Photo") ||
      mediaRecord.photo
    );
  }

  private async saveIncomingImage(client: TelegramClient, message: NewMessageEvent["message"]) {
    const media = (message as unknown as { media?: unknown }).media;
    if (!media) return null;

    const mediaRecord = media as IncomingMediaRecord;
    const mimeType = mediaRecord.document?.mimeType ?? (String(mediaRecord.className ?? "").includes("Photo") || mediaRecord.photo ? "image/jpeg" : "");
    if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) return null;

    const messageWithDownload = message as unknown as {
      downloadMedia?: (options?: Record<string, unknown>) => Promise<Buffer | Uint8Array | string | undefined>;
    };
    const downloaded = messageWithDownload.downloadMedia
      ? await messageWithDownload.downloadMedia({})
      : await (client as unknown as {
          downloadMedia: (media: unknown, options?: Record<string, unknown>) => Promise<Buffer | Uint8Array | string | undefined>;
        }).downloadMedia(message, {});
    if (!downloaded || typeof downloaded === "string") return null;

    const buffer = Buffer.isBuffer(downloaded) ? downloaded : Buffer.from(downloaded);
    const originalName = mediaRecord.document?.attributes?.find((attribute) => attribute.fileName)?.fileName ?? `telegram-${message.id}.jpg`;
    return mediaService.saveBuffer({
      buffer,
      mimetype: mimeType,
      originalName,
      temporary: true,
      ttlHours: 24
    });
  }

  private async ensureLeadForConversation(conversationId: string, chatId: string, fallbackName: string, inboundText?: string) {
    const existing = await prisma.lead.findUnique({ where: { telegramChatId: chatId } });
    if (existing) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: {
          lastInboundMessage: inboundText,
          lastInteractionAt: new Date(),
          userWroteFirst: true,
          conversationActive: true
        }
      });
      return existing;
    }

    const lead = await prisma.lead.create({
      data: {
        telegramChatId: chatId,
        name: fallbackName || chatId,
        lastInboundMessage: inboundText,
        lastInteractionAt: new Date(),
        userWroteFirst: true,
        conversationActive: true
      }
    });
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { leadId: lead.id }
    });
    await automationService.scheduleForTrigger("LEAD_CREATED", lead.id);
    return lead;
  }

  private rememberDialogEntity(dialog: DialogLike) {
    const target = (dialog.inputEntity ?? dialog.entity) as TelegramTarget | undefined;
    if (!target) return;
    const ids = [telegramId(dialog.id), telegramId(dialog.entity?.id)].filter(Boolean);
    for (const id of ids) this.entityCache.set(id, target);
  }

  private async resolveEntity(client: TelegramClient, chatId: string) {
    const cached = this.entityCache.get(chatId);
    if (cached) return cached;

    const dialogs = (await client.getDialogs({ limit: config.telegram.syncLimit })) as unknown as DialogLike[];
    for (const dialog of dialogs) this.rememberDialogEntity(dialog);

    const resolved = this.entityCache.get(chatId);
    if (resolved) return resolved;

    try {
      const inputEntity = await client.getInputEntity(BigInt(chatId) as never);
      this.entityCache.set(chatId, inputEntity);
      return inputEntity;
    } catch {
      throw new Error(`No se pudo resolver la entidad de Telegram para el chat ${chatId}. Sincroniza los chats e intenta otra vez.`);
    }
  }

  private async upsertDialog(dialog: DialogLike) {
    const entity = dialog.entity ?? {};
    const rawId = entity.id ?? dialog.id;
    const telegramChatId = telegramId(rawId);
    if (!telegramChatId || telegramChatId === "undefined") return;

    const className = String(entity.className ?? "");
    const type: ConversationType = className === "Channel"
      ? (entity.broadcast ? "CHANNEL" : "GROUP")
      : className === "Chat"
        ? "GROUP"
        : "PRIVATE";
    const isPrivate = type === "PRIVATE";
    const name = String(
      dialog.name ??
        entity.title ??
        [entity.firstName, entity.lastName].filter(Boolean).join(" ") ??
        entity.username ??
        telegramChatId
    );
    const lastMessage = dialog.message?.message ?? "";
    const lastMessageAt = dialog.message?.date ? new Date(dialog.message.date * 1000) : undefined;
    const userWroteFirst = Boolean(lastMessage && !dialog.message?.out);

    let leadId: string | undefined;
    if (isPrivate) {
      const lead = await prisma.lead.upsert({
        where: { telegramChatId },
        update: {
          name,
          username: typeof entity.username === "string" ? entity.username : undefined,
          phone: typeof entity.phone === "string" ? entity.phone : undefined,
          lastInboundMessage: userWroteFirst ? lastMessage : undefined,
          lastInteractionAt: lastMessageAt,
          userWroteFirst: userWroteFirst ? true : undefined,
          conversationActive: userWroteFirst ? true : undefined
        },
        create: {
          telegramChatId,
          telegramUserId: String(entity.id ?? telegramChatId),
          name,
          username: typeof entity.username === "string" ? entity.username : undefined,
          phone: typeof entity.phone === "string" ? entity.phone : undefined,
          lastInboundMessage: userWroteFirst ? lastMessage : undefined,
          lastInteractionAt: lastMessageAt,
          userWroteFirst,
          conversationActive: userWroteFirst
        }
      });
      leadId = lead.id;
    }

    await prisma.conversation.upsert({
      where: { telegramChatId },
      update: {
        name,
        username: typeof entity.username === "string" ? entity.username : undefined,
        phone: typeof entity.phone === "string" ? entity.phone : undefined,
        type,
        lastMessage,
        lastMessageAt,
        userWroteFirst: userWroteFirst ? true : undefined,
        conversationActive: userWroteFirst ? true : undefined,
        leadId
      },
      create: {
        telegramChatId,
        telegramUserId: String(entity.id ?? telegramChatId),
        name,
        username: typeof entity.username === "string" ? entity.username : undefined,
        phone: typeof entity.phone === "string" ? entity.phone : undefined,
        type,
        lastMessage,
        lastMessageAt,
        userWroteFirst,
        conversationActive: userWroteFirst,
        leadId
      }
    });
  }

  private async requireClient() {
    if (this.client && (await this.client.checkAuthorization())) return this.client;
    await this.restoreConnectedSession();
    if (!this.client) {
      const error = new Error("Telegram no esta conectado");
      (error as Error & { status?: number }).status = 409;
      throw error;
    }
    return this.client;
  }
}

export const telegramService = new TelegramService();
