import fs from "node:fs/promises";
import path from "node:path";
import { TelegramClient } from "telegram";
import { CustomFile } from "telegram/client/uploads";
import { StringSession } from "telegram/sessions";
import { prisma } from "@crm/db";
import { canMessageLead, type SendIntent } from "@crm/shared";
import { config } from "./config";
import { decryptSecret } from "./crypto";

let client: TelegramClient | undefined;

async function resolveMediaFile(media: { storage: string; filename: string; url: string; deletedAt: Date | null; content: Uint8Array | null }) {
  if (media.deletedAt) throw new Error("La imagen fue eliminada o ya expiro");
  if (media.content) return new CustomFile(media.filename, media.content.length, "", Buffer.from(media.content));
  if (media.storage !== "local") return media.url;

  const localFile = path.resolve(config.media.localDir, media.filename);
  try {
    await fs.access(localFile);
    return localFile;
  } catch {
    if (media.url.startsWith("http://") || media.url.startsWith("https://")) return media.url;
    if (media.url.startsWith("/")) return `${config.apiUrl}${media.url}`;
    throw new Error("La imagen no existe en el worker. Configura API_URL en el servicio Worker.");
  }
}

async function getClient() {
  if (client && (await client.checkAuthorization())) return client;
  const session = await prisma.telegramSession.findUnique({ where: { label: config.telegram.sessionLabel } });
  const saved = decryptSecret(session?.encryptedSession);
  if (!saved) throw new Error("Telegram no esta conectado");

  client = new TelegramClient(new StringSession(saved), config.telegram.apiId, config.telegram.apiHash, {
    connectionRetries: 5
  });
  await client.connect();
  if (!(await client.checkAuthorization())) throw new Error("Sesion de Telegram expirada");
  return client;
}

export async function sendToLead(input: {
  leadId: string;
  text?: string;
  mediaAssetId?: string;
  sensitive?: boolean;
  intent: SendIntent;
  aiGenerated?: boolean;
}) {
  const lead = await prisma.lead.findUniqueOrThrow({ where: { id: input.leadId } });
  const permission = canMessageLead(
    {
      status: lead.status,
      optInCommercial: lead.optInCommercial,
      ageConfirmed: lead.ageConfirmed,
      followUpAllowed: lead.followUpAllowed,
      userWroteFirst: lead.userWroteFirst,
      conversationActive: lead.conversationActive
    },
    input.intent,
    { sensitive: input.sensitive, commercial: input.intent === "campaign" || input.intent === "follow_up" }
  );
  if (!permission.allowed) {
    throw new Error(permission.reasons.join("; "));
  }
  if (!lead.telegramChatId) throw new Error("Lead sin telegramChatId");

  const conversation = await prisma.conversation.findUniqueOrThrow({ where: { telegramChatId: lead.telegramChatId } });
  const media = input.mediaAssetId ? await prisma.mediaAsset.findUniqueOrThrow({ where: { id: input.mediaAssetId } }) : null;
  const tg = await getClient();

  if (media) {
    const file = await resolveMediaFile(media);
    await tg.sendFile(lead.telegramChatId, { file, caption: input.text });
  } else {
    await tg.sendMessage(lead.telegramChatId, { message: input.text ?? "" });
  }

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      leadId: lead.id,
      direction: "OUTBOUND",
      status: "SENT",
      body: input.text,
      mediaAssetId: input.mediaAssetId,
      sensitive: input.sensitive ?? false,
      aiGenerated: input.aiGenerated ?? false,
      sentAt: new Date()
    }
  });
  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastOutboundMessage: input.text, lastInteractionAt: new Date(), conversationActive: true }
  });
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessage: input.text ?? "[imagen]", lastMessageAt: new Date(), responded: true }
  });
}
