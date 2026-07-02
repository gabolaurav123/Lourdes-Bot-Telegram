CREATE TYPE "AdminRole" AS ENUM ('OWNER', 'ADMIN', 'VENDEDOR', 'SOPORTE');
CREATE TYPE "TelegramSessionStatus" AS ENUM ('DISCONNECTED', 'QR_PENDING', 'CONNECTED', 'EXPIRED', 'ERROR');
CREATE TYPE "ConversationType" AS ENUM ('PRIVATE', 'GROUP', 'CHANNEL');
CREATE TYPE "LeadStatus" AS ENUM ('NUEVO', 'INTERESADO', 'CALIENTE', 'RESPONDIO', 'PENDIENTE_PAGO', 'COMPRO', 'NO_INTERESADO', 'NO_VOLVER_A_ESCRIBIR', 'BLOQUEADO', 'ERROR', 'REQUIERE_REVISION_MANUAL');
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'INTERNAL', 'SYSTEM');
CREATE TYPE "MessageStatus" AS ENUM ('RECEIVED', 'QUEUED', 'SENT', 'FAILED', 'SKIPPED');
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'PAUSED', 'FINISHED');
CREATE TYPE "CampaignRecipientStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');
CREATE TYPE "AutomationStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "AutomationRunStatus" AS ENUM ('SCHEDULED', 'EXECUTED', 'SKIPPED', 'FAILED', 'CANCELLED');
CREATE TYPE "TemplateCategory" AS ENUM ('BIENVENIDA', 'CONFIRMACION_EDAD', 'PRECIO', 'SEGUIMIENTO_24H', 'SEGUIMIENTO_48H', 'PROMO', 'CIERRE_SUAVE', 'POST_COMPRA', 'NO_INTERESADO', 'STOP');
CREATE TYPE "PurchaseStatus" AS ENUM ('PENDIENTE', 'CONFIRMADO', 'RECHAZADO');

CREATE TABLE "AdminUser" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "AdminRole" NOT NULL DEFAULT 'SOPORTE',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "lastLoginAt" TIMESTAMP(3),
  CONSTRAINT "AdminUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramSession" (
  "id" TEXT NOT NULL,
  "label" TEXT NOT NULL DEFAULT 'primary',
  "status" "TelegramSessionStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "encryptedSession" TEXT,
  "phone" TEXT,
  "username" TEXT,
  "displayName" TEXT,
  "qrCodeDataUrl" TEXT,
  "qrExpiresAt" TIMESTAMP(3),
  "lastError" TEXT,
  "connectedAt" TIMESTAMP(3),
  "disconnectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lead" (
  "id" TEXT NOT NULL,
  "telegramChatId" TEXT,
  "telegramUserId" TEXT,
  "name" TEXT NOT NULL,
  "username" TEXT,
  "phone" TEXT,
  "source" TEXT NOT NULL DEFAULT 'telegram',
  "status" "LeadStatus" NOT NULL DEFAULT 'NUEVO',
  "notes" TEXT,
  "firstContactAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastInteractionAt" TIMESTAMP(3),
  "lastInboundMessage" TEXT,
  "lastOutboundMessage" TEXT,
  "optInCommercial" BOOLEAN NOT NULL DEFAULT false,
  "ageConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "followUpAllowed" BOOLEAN NOT NULL DEFAULT false,
  "purchaseStatus" "PurchaseStatus",
  "totalSpent" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "aiEnabled" BOOLEAN NOT NULL DEFAULT true,
  "userWroteFirst" BOOLEAN NOT NULL DEFAULT false,
  "conversationActive" BOOLEAN NOT NULL DEFAULT false,
  "isContact" BOOLEAN NOT NULL DEFAULT false,
  "isGroup" BOOLEAN NOT NULL DEFAULT false,
  "isChannel" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
  "id" TEXT NOT NULL,
  "telegramChatId" TEXT NOT NULL,
  "telegramUserId" TEXT,
  "type" "ConversationType" NOT NULL DEFAULT 'PRIVATE',
  "name" TEXT NOT NULL,
  "username" TEXT,
  "phone" TEXT,
  "lastMessage" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "unreadCount" INTEGER NOT NULL DEFAULT 0,
  "responded" BOOLEAN NOT NULL DEFAULT false,
  "userWroteFirst" BOOLEAN NOT NULL DEFAULT false,
  "conversationActive" BOOLEAN NOT NULL DEFAULT false,
  "isContact" BOOLEAN NOT NULL DEFAULT false,
  "leadId" TEXT,
  "assignedToId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
  "id" TEXT NOT NULL,
  "telegramMessageId" TEXT,
  "conversationId" TEXT NOT NULL,
  "leadId" TEXT,
  "direction" "MessageDirection" NOT NULL,
  "status" "MessageStatus" NOT NULL DEFAULT 'RECEIVED',
  "body" TEXT,
  "mediaAssetId" TEXT,
  "aiGenerated" BOOLEAN NOT NULL DEFAULT false,
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  "sentById" TEXT,
  "error" TEXT,
  "receivedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tag" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "color" TEXT NOT NULL DEFAULT '#0f766e',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadTag" (
  "leadId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadTag_pkey" PRIMARY KEY ("leadId","tagId")
);

CREATE TABLE "Template" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "category" "TemplateCategory" NOT NULL,
  "text" TEXT NOT NULL,
  "imageId" TEXT,
  "variables" JSONB NOT NULL DEFAULT '[]',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Campaign" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "segment" JSONB NOT NULL DEFAULT '{}',
  "exclusions" JSONB NOT NULL DEFAULT '{}',
  "message" TEXT NOT NULL,
  "imageId" TEXT,
  "buttonText" TEXT,
  "link" TEXT,
  "startAt" TIMESTAMP(3),
  "sendTime" TEXT NOT NULL DEFAULT '10:00',
  "dailyLimit" INTEGER NOT NULL DEFAULT 50,
  "pauseSeconds" INTEGER NOT NULL DEFAULT 90,
  "allowedHours" JSONB NOT NULL DEFAULT '{}',
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  "stats" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CampaignRecipient" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "status" "CampaignRecipientStatus" NOT NULL DEFAULT 'PENDING',
  "scheduledAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Automation" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "status" "AutomationStatus" NOT NULL DEFAULT 'INACTIVE',
  "trigger" TEXT NOT NULL,
  "conditions" JSONB NOT NULL DEFAULT '{}',
  "delaySeconds" INTEGER NOT NULL DEFAULT 0,
  "action" TEXT NOT NULL,
  "actionPayload" JSONB NOT NULL DEFAULT '{}',
  "executionLimit" INTEGER NOT NULL DEFAULT 1,
  "segment" JSONB NOT NULL DEFAULT '{}',
  "allowedHours" JSONB NOT NULL DEFAULT '{}',
  "priority" INTEGER NOT NULL DEFAULT 0,
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  "allowRepeat" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Automation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationRun" (
  "id" TEXT NOT NULL,
  "automationId" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "status" "AutomationRunStatus" NOT NULL DEFAULT 'SCHEDULED',
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "executedAt" TIMESTAMP(3),
  "payload" JSONB NOT NULL DEFAULT '{}',
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaAsset" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "storage" TEXT NOT NULL DEFAULT 'local',
  "filename" TEXT NOT NULL,
  "originalName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "checksum" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MediaAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Purchase" (
  "id" TEXT NOT NULL,
  "leadId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "amount" DECIMAL(12,2) NOT NULL,
  "paymentMethod" TEXT NOT NULL,
  "plan" TEXT NOT NULL,
  "notes" TEXT,
  "receiptAssetId" TEXT,
  "status" "PurchaseStatus" NOT NULL DEFAULT 'PENDIENTE',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Setting" (
  "key" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "sensitive" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "actorId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "ip" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiConfig" (
  "id" TEXT NOT NULL,
  "model" TEXT NOT NULL DEFAULT 'gpt-4.1-mini',
  "encryptedApiKey" TEXT,
  "promptBase" TEXT NOT NULL,
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
  "maxTokens" INTEGER NOT NULL DEFAULT 400,
  "tone" TEXT NOT NULL DEFAULT 'calido, breve y natural',
  "maxChars" INTEGER NOT NULL DEFAULT 700,
  "allowedHours" JSONB NOT NULL DEFAULT '{}',
  "forbiddenWords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "globalEnabled" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AiConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminUser_email_key" ON "AdminUser"("email");
CREATE UNIQUE INDEX "TelegramSession_label_key" ON "TelegramSession"("label");
CREATE UNIQUE INDEX "Lead_telegramChatId_key" ON "Lead"("telegramChatId");
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
CREATE INDEX "Lead_optInCommercial_ageConfirmed_followUpAllowed_idx" ON "Lead"("optInCommercial","ageConfirmed","followUpAllowed");
CREATE UNIQUE INDEX "Conversation_telegramChatId_key" ON "Conversation"("telegramChatId");
CREATE INDEX "Conversation_lastMessageAt_idx" ON "Conversation"("lastMessageAt");
CREATE INDEX "Conversation_type_idx" ON "Conversation"("type");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId","createdAt");
CREATE INDEX "Message_leadId_createdAt_idx" ON "Message"("leadId","createdAt");
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_leadId_key" ON "CampaignRecipient"("campaignId","leadId");
CREATE INDEX "CampaignRecipient_status_scheduledAt_idx" ON "CampaignRecipient"("status","scheduledAt");
CREATE INDEX "Automation_status_trigger_idx" ON "Automation"("status","trigger");
CREATE INDEX "AutomationRun_status_scheduledFor_idx" ON "AutomationRun"("status","scheduledFor");
CREATE INDEX "AutomationRun_leadId_automationId_idx" ON "AutomationRun"("leadId","automationId");
CREATE UNIQUE INDEX "MediaAsset_key_key" ON "MediaAsset"("key");
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action","createdAt");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType","entityId");

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_mediaAssetId_fkey" FOREIGN KEY ("mediaAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Message" ADD CONSTRAINT "Message_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeadTag" ADD CONSTRAINT "LeadTag_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadTag" ADD CONSTRAINT "LeadTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Template" ADD CONSTRAINT "Template_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_receiptAssetId_fkey" FOREIGN KEY ("receiptAssetId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
