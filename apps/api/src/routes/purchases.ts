import { Router } from "express";
import { purchaseSchema } from "@crm/shared";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { automationService } from "../services/automation.service";

export const purchasesRouter = Router();

purchasesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.purchase.findMany({ include: { lead: true, receipt: true }, orderBy: { createdAt: "desc" } }));
  })
);

purchasesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const input = purchaseSchema.parse(req.body);
    const purchase = await prisma.purchase.create({
      data: {
        leadId: input.leadId,
        amount: input.amount,
        paymentMethod: input.paymentMethod,
        plan: input.plan,
        notes: input.notes,
        receiptAssetId: input.receiptAssetId,
        status: "CONFIRMADO"
      }
    });
    await prisma.lead.update({
      where: { id: input.leadId },
      data: {
        status: "COMPRO",
        purchaseStatus: "CONFIRMADO",
        totalSpent: { increment: input.amount }
      }
    });
    const tag = await prisma.tag.upsert({
      where: { name: "comprador" },
      update: {},
      create: { name: "comprador", color: "#16a34a" }
    });
    await prisma.leadTag.upsert({
      where: { leadId_tagId: { leadId: input.leadId, tagId: tag.id } },
      update: {},
      create: { leadId: input.leadId, tagId: tag.id }
    });
    await automationService.cancelPendingForLead(input.leadId);
    await auditLog(req, "PURCHASE_REGISTERED", { entityType: "Purchase", entityId: purchase.id });
    res.status(201).json(purchase);
  })
);
