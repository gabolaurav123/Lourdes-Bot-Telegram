import type { Prisma } from "@prisma/client";
import { prisma } from "@crm/db";

const startedAt = new Date().toISOString();

type WorkerStatusInput = {
  state: "STARTING" | "RUNNING" | "ERROR";
  lastSuccessAt?: string;
  lastError?: string | null;
};

export async function writeWorkerStatus(input: WorkerStatusInput) {
  const value = {
    service: "crm-worker",
    state: input.state,
    startedAt,
    updatedAt: new Date().toISOString(),
    lastSuccessAt: input.lastSuccessAt,
    lastError: input.lastError ?? null
  } satisfies Prisma.InputJsonObject;

  await prisma.setting.upsert({
    where: { key: "worker:status" },
    update: { value },
    create: { key: "worker:status", value, sensitive: false }
  });
}
