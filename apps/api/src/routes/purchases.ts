import { Router } from "express";
import { purchaseSchema } from "@crm/shared";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { automationService } from "../services/automation.service";

export const purchasesRouter = Router();

const purchaseStatusSchema = z.object({
  status: z.enum(["PENDIENTE", "CONFIRMADO", "RECHAZADO"])
});

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
        status: "PENDIENTE"
      }
    });
    await auditLog(req, "PURCHASE_REGISTERED", { entityType: "Purchase", entityId: purchase.id });
    res.status(201).json(purchase);
  })
);

purchasesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = purchaseStatusSchema.parse(req.body);
    const existing = await prisma.purchase.findUniqueOrThrow({ where: { id: req.params.id } });
    const purchase = await prisma.purchase.update({
      where: { id: req.params.id },
      data: { status: input.status },
      include: { lead: true, receipt: true }
    });

    if (input.status === "CONFIRMADO" && existing.status !== "CONFIRMADO") {
      await prisma.lead.update({
        where: { id: purchase.leadId },
        data: {
          status: "COMPRO",
          purchaseStatus: "CONFIRMADO",
          totalSpent: { increment: purchase.amount }
        }
      });
      const tag = await prisma.tag.upsert({
        where: { name: "comprador" },
        update: {},
        create: { name: "comprador", color: "#16a34a" }
      });
      await prisma.leadTag.upsert({
        where: { leadId_tagId: { leadId: purchase.leadId, tagId: tag.id } },
        update: {},
        create: { leadId: purchase.leadId, tagId: tag.id }
      });
      await automationService.cancelPendingForLead(purchase.leadId);
    }

    if (input.status === "RECHAZADO" && existing.status !== "RECHAZADO") {
      await prisma.lead.update({
        where: { id: purchase.leadId },
        data: {
          purchaseStatus: "RECHAZADO",
          ...(existing.status === "CONFIRMADO" ? { totalSpent: { decrement: purchase.amount } } : {})
        }
      });
    }

    await auditLog(req, "PURCHASE_STATUS_UPDATED", { entityType: "Purchase", entityId: purchase.id, metadata: input });
    res.json(purchase);
  })
);
