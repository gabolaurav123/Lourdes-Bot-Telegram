import type { Prisma } from "@prisma/client";

export const safeMediaSelect = {
  id: true,
  key: true,
  url: true,
  storage: true,
  filename: true,
  originalName: true,
  mimeType: true,
  sizeBytes: true,
  width: true,
  height: true,
  checksum: true,
  temporary: true,
  expiresAt: true,
  deletedAt: true,
  createdAt: true
} satisfies Prisma.MediaAssetSelect;
