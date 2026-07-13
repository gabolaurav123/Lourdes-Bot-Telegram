import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@crm/db";
import { config } from "../config";

export async function cleanupTemporaryMedia() {
  const expired = await prisma.mediaAsset.findMany({
    where: {
      temporary: true,
      deletedAt: null,
      expiresAt: { lte: new Date() }
    },
    take: 100
  });

  for (const asset of expired) {
    if (asset.storage === "local") {
      await fs.rm(path.resolve(config.media.localDir, asset.filename), { force: true }).catch(() => undefined);
    }

    await prisma.mediaAsset.update({
      where: { id: asset.id },
      data: { deletedAt: new Date(), content: null }
    });
  }
}
