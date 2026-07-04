ALTER TABLE "MediaAsset" ADD COLUMN "temporary" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "MediaAsset" ADD COLUMN "expiresAt" TIMESTAMP(3);
CREATE INDEX "MediaAsset_temporary_expiresAt_idx" ON "MediaAsset"("temporary", "expiresAt");
