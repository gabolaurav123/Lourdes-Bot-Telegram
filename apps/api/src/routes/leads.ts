import { Router } from "express";
import { leadUpdateSchema } from "@crm/shared";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { automationService } from "../services/automation.service";

export const leadsRouter = Router();

leadsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const status = req.query.status?.toString();
    const q = req.query.q?.toString();
    const tagId = req.query.tagId?.toString();

    const leads = await prisma.lead.findMany({
      where: {
        ...(status ? { status: status as never } : {}),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { username: { contains: q, mode: "insensitive" } },
                { phone: { contains: q } }
              ]
            }
          : {}),
        ...(tagId ? { tags: { some: { tagId } } } : {})
      },
      include: { tags: { include: { tag: true } } },
      orderBy: { updatedAt: "desc" },
      take: Number(req.query.limit ?? 100)
    });

    res.json(leads);
  })
);

leadsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(
      await prisma.lead.findUniqueOrThrow({
        where: { id: req.params.id },
        include: {
          tags: { include: { tag: true } },
          purchases: true,
          automationRuns: { include: { automation: true }, orderBy: { createdAt: "desc" } },
          campaignRecipients: { include: { campaign: true }, orderBy: { createdAt: "desc" } }
        }
      })
    );
  })
);

leadsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const input = leadUpdateSchema.parse(req.body);
    const updated = await prisma.lead.update({ where: { id: req.params.id }, data: input });
    if (input.status === "NO_VOLVER_A_ESCRIBIR" || input.status === "NO_INTERESADO" || input.status === "BLOQUEADO") {
      await automationService.cancelPendingForLead(req.params.id);
    }
    await auditLog(req, "LEAD_UPDATED", { entityType: "Lead", entityId: req.params.id, metadata: input });
    res.json(updated);
  })
);

leadsRouter.post(
  "/:id/tags",
  asyncHandler(async (req, res) => {
    const name = String(req.body.name ?? "").trim();
    if (!name) throw new Error("Nombre de etiqueta requerido");
    const tag = await prisma.tag.upsert({
      where: { name },
      update: { color: req.body.color },
      create: { name, color: req.body.color ?? "#0f766e" }
    });
    await prisma.leadTag.upsert({
      where: { leadId_tagId: { leadId: req.params.id, tagId: tag.id } },
      update: {},
      create: { leadId: req.params.id, tagId: tag.id }
    });
    await auditLog(req, "LEAD_TAG_ADDED", { entityType: "Lead", entityId: req.params.id, metadata: { tag: name } });
    res.status(201).json(tag);
  })
);

leadsRouter.delete(
  "/:id/tags/:tagId",
  asyncHandler(async (req, res) => {
    await prisma.leadTag.delete({ where: { leadId_tagId: { leadId: req.params.id, tagId: req.params.tagId } } });
    await auditLog(req, "LEAD_TAG_REMOVED", { entityType: "Lead", entityId: req.params.id, metadata: { tagId: req.params.tagId } });
    res.json({ ok: true });
  })
);
