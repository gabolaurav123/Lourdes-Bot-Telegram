import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_AI_PROMPT, INITIAL_TEMPLATES } from "@crm/shared";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (process.env.NODE_ENV === "production" && (!email || !password)) {
    throw new Error("ADMIN_BOOTSTRAP_EMAIL y ADMIN_BOOTSTRAP_PASSWORD son obligatorios en produccion");
  }

  const bootstrapEmail = email ?? "owner@example.com";
  const bootstrapPassword = password ?? "ChangeMe123!";

  if (process.env.NODE_ENV === "production" && bootstrapEmail !== "owner@example.com") {
    await prisma.adminUser.deleteMany({ where: { email: "owner@example.com" } });
  }

  await prisma.adminUser.upsert({
    where: { email: bootstrapEmail },
    update: {},
    create: {
      email: bootstrapEmail,
      passwordHash: await bcrypt.hash(bootstrapPassword, 12),
      role: "OWNER"
    }
  });

  for (const template of INITIAL_TEMPLATES) {
    await prisma.template.upsert({
      where: { id: `${template.category.toLowerCase()}-seed` },
      update: {
        name: template.name,
        text: template.text,
        active: true
      },
      create: {
        id: `${template.category.toLowerCase()}-seed`,
        name: template.name,
        category: template.category,
        text: template.text,
        variables: []
      }
    });
  }

  const tags = [
    ["comprador", "#16a34a"],
    ["caliente", "#dc2626"],
    ["precio", "#d97706"],
    ["opt-in", "#0f766e"],
    ["revision", "#7c3aed"]
  ] as const;

  for (const [name, color] of tags) {
    await prisma.tag.upsert({
      where: { name },
      update: { color },
      create: { name, color }
    });
  }

  await prisma.aiConfig.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      model: process.env.OPENAI_MODEL ?? "gpt-4.1-nano",
      promptBase: DEFAULT_AI_PROMPT,
      globalEnabled: process.env.GLOBAL_AI_ENABLED === "true"
    }
  });

  await prisma.telegramSession.upsert({
    where: { label: process.env.TELEGRAM_SESSION_LABEL ?? "primary" },
    update: {},
    create: {
      label: process.env.TELEGRAM_SESSION_LABEL ?? "primary",
      status: "DISCONNECTED"
    }
  });

  const settings = {
    crmName: "Telegram Consent CRM",
    timezone: process.env.DEFAULT_TIMEZONE ?? "America/La_Paz",
    paymentLink: process.env.PAYMENT_LINK ?? "",
    globalCampaignsEnabled: process.env.GLOBAL_CAMPAIGNS_ENABLED !== "false",
    stopWords: ["no", "stop", "cancelar", "no me escribas", "no me interesa"],
    defaultLeadStatus: "NUEVO",
    automationAllowedHours: { start: "09:00", end: "20:00" }
  };

  for (const [key, value] of Object.entries(settings)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value },
      create: { key, value }
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
