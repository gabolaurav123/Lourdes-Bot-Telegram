import multer from "multer";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { asyncHandler } from "../lib/async";
import { auditLog } from "../lib/audit";
import { mediaService } from "../services/media.service";
import { config } from "../config";
import { safeMediaSelect } from "../lib/media";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.media.maxMb * 1024 * 1024 }
});

export const mediaRouter = Router();

mediaRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    res.json(await prisma.mediaAsset.findMany({ where: { deletedAt: null, temporary: false }, select: safeMediaSelect, orderBy: { createdAt: "desc" } }));
  })
);

mediaRouter.post(
  "/",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new Error("Archivo requerido");
    const asset = await mediaService.saveUpload(req.file);
    await auditLog(req, "MEDIA_UPLOADED", { entityType: "MediaAsset", entityId: asset.id });
    res.status(201).json(asset);
  })
);

mediaRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const asset = await mediaService.remove(req.params.id);
    await auditLog(req, "MEDIA_DELETED", { entityType: "MediaAsset", entityId: req.params.id });
    res.json(asset);
  })
);
