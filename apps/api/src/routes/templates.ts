import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { toInputJson } from "../lib/json";

export const templatesRouter = Router();

templatesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.template.findMany({ include: { image: true }, orderBy: { category: "asc" } }));
  })
);

templatesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const template = await prisma.template.create({
      data: {
        name: String(req.body.name),
        category: req.body.category,
        text: String(req.body.text),
        imageId: req.body.imageId,
        variables: toInputJson(req.body.variables ?? []),
        active: req.body.active ?? true
      }
    });
    await auditLog(req, "TEMPLATE_CREATED", { entityType: "Template", entityId: template.id });
    res.status(201).json(template);
  })
);

templatesRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const template = await prisma.template.update({ where: { id: req.params.id }, data: req.body });
    await auditLog(req, "TEMPLATE_UPDATED", { entityType: "Template", entityId: req.params.id });
    res.json(template);
  })
);
