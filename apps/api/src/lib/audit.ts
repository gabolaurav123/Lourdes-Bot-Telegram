import type { Request } from "express";
import { prisma } from "./prisma";
import type { JwtUser } from "./auth";
import { toInputJson } from "./json";

export async function auditLog(
  req: Request,
  action: string,
  input: { entityType?: string; entityId?: string; metadata?: Record<string, unknown>; actor?: JwtUser | null } = {}
) {
  const actor = input.actor ?? (req as Request & { user?: JwtUser }).user ?? null;
  await prisma.auditLog.create({
    data: {
      actorId: actor?.id,
      action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: toInputJson(input.metadata ?? {}),
      ip: req.ip,
      userAgent: req.header("user-agent")
    }
  });
}
