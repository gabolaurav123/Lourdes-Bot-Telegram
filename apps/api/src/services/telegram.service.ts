import path from "node:path";
import QRCode from "qrcode";
import { Api, TelegramClient } from "telegram";
import { NewMessage, type NewMessageEvent } from "telegram/events";
import { StringSession } from "telegram/sessions";
import type { ConversationType, Lead, MessageStatus } from "@prisma/client";
import { containsStopPhrase } from "@crm/shared";
import { config } from "../config";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { prisma } from "../lib/prisma";
import { sanitizeText } from "../lib/sanitize";
import { assertCanMessageLead } from "./permission.service";
import { aiService } from "./ai.service";
import { automationService } from "./automation.service";

type DialogLike = {
  id?: unknown;
  name?: string;
  title?: string;
  message?: { message?: string; date?: number; out?: boolean };
  entity?: Record<string, unknown>;
};

class TelegramService {
  private client?: TelegramClient;
  private loginPromise?: Promise<unknown>;

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
      await this.upsertDialog(dialog);
      count += 1;
    }

    return { count };
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
    const media = input.mediaAssetId
      ? await prisma.mediaAsset.findUniqueOrThrow({ where: { id: input.mediaAssetId } })
      : null;

    let status: MessageStatus = "SENT";
    let telegramMessageId: string | undefined;
    let error: string | undefined;

    try {
      if (media) {
        const file = media.storage === "local" ? path.resolve(config.media.localDir, media.filename) : media.url;
        const sent = await client.sendFile(conversation.telegramChatId, {
          file,
          caption: input.text
        });
        telegramMessageId = String((sent as { id?: unknown }).id ?? "");
      } else {
        const sent = await client.sendMessage(conversation.telegramChatId, {
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
        responded: true,
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

  private attachIncomingHandler(client: TelegramClient) {
    client.addEventHandler((event) => this.handleIncoming(event as NewMessageEvent), new NewMessage({ incoming: true }));
  }

  private async handleIncoming(event: NewMessageEvent) {
    const message = event.message;
    const chatId = String(message.chatId?.valueOf?.() ?? message.peerId?.className ?? "");
    if (!chatId) return;

    const text = sanitizeText(message.message ?? "");
    const conversation = await prisma.conversation.upsert({
      where: { telegramChatId: chatId },
      update: {
        lastMessage: text || "[media]",
        lastMessageAt: new Date(),
        unreadCount: { increment: 1 },
        userWroteFirst: true,
        conversationActive: true
      },
      create: {
        telegramChatId: chatId,
        name: chatId,
        type: "PRIVATE",
        lastMessage: text || "[media]",
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

    await automationService.scheduleForTrigger("NEW_MESSAGE_RECEIVED", lead.id, { text });

    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    const aiReply = await aiService.generateReply(updatedLead, conversation, text);
    if (aiReply) {
      await this.sendMessageFromPanel({
        conversationId: conversation.id,
        text: aiReply,
        aiGenerated: true,
        intent: "ai_reply"
      });
    }
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

  private async upsertDialog(dialog: DialogLike) {
    const entity = dialog.entity ?? {};
    const rawId = entity.id ?? dialog.id;
    const telegramChatId = String(
      typeof rawId === "object" && rawId && "value" in rawId ? (rawId as { value: unknown }).value : rawId
    );
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
          userWroteFirst,
          conversationActive: userWroteFirst
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
        userWroteFirst,
        conversationActive: userWroteFirst,
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
