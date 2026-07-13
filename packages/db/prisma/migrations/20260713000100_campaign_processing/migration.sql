ALTER TYPE "CampaignRecipientStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

ALTER TABLE "CampaignRecipient"
ADD COLUMN "lastAttemptAt" TIMESTAMP(3);

CREATE INDEX "CampaignRecipient_campaignId_status_idx"
ON "CampaignRecipient"("campaignId", "status");
