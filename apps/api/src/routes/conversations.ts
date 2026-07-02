import { Router } from "express";
import { sendMessageSchema } from "@crm/shared";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { sanitizeText } from "../lib/sanitize";
import { telegramService } from "../services/telegram.service";
import type { AuthenticatedRequest } from "../middleware/auth";

export const conversationsRouter = Router();

conversationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const type = req.query.type?.toString();
    const unanswered = req.query.unanswered === "true";
    const unread = req.query.unread === "true";

    const conversations = await prisma.conversation.findMany({
      where: {
        ...(type ? { type: type as never } : {}),
        ...(unanswered ? { responded: false } : {}),
        ...(unread ? { unreadCount: { gt: 0 } } : {})
      },
      include: { lead: { include: { tags: { include: { tag: true } } } }, assignedTo: true },
      orderBy: { lastMessageAt: "desc" },
      take: Number(req.query.limit ?? 100)
    });

    res.json(conversations);
  })
);

conversationsRouter.get(
  "/:id/messages",
  asyncHandler(async (req, res) => {
    const messages = await prisma.message.findMany({
      where: { conversationId: req.params.id },
      include: { mediaAsset: true, sentBy: { select: { id: true, email: true, role: true } } },
      orderBy: { createdAt: "asc" },
      take: Number(req.query.limit ?? 200)
    });
    res.json(messages);
  })
);

conversationsRouter.post(
  "/:id/messages",
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const input = sendMessageSchema.parse({ ...req.body, conversationId: req.params.id });
    const message = await telegramService.sendMessageFromPanel({
      conversationId: input.conversationId,
      text: input.text ? sanitizeText(input.text) : undefined,
      mediaAssetId: input.mediaAssetId,
      sensitive: input.sensitive,
      actorId: req.user.id,
      intent: "manual_reply"
    });
    await auditLog(req, "MESSAGE_SENT", { entityType: "Conversation", entityId: input.conversationId });
    res.status(201).json(message);
  })
);

conversationsRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const conversation = await prisma.conversation.update({ where: { id: req.params.id }, data: { unreadCount: 0 } });
    await auditLog(req, "CONVERSATION_READ", { entityType: "Conversation", entityId: req.params.id });
    res.json(conversation);
  })
);
