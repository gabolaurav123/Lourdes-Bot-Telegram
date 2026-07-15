ALTER TABLE "AiConfig"
ADD COLUMN "dailyReplyLimit" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN "historyMessages" INTEGER NOT NULL DEFAULT 4;

ALTER TABLE "AiConfig"
ALTER COLUMN "model" SET DEFAULT 'gpt-4.1-nano',
ALTER COLUMN "maxTokens" SET DEFAULT 120,
ALTER COLUMN "maxChars" SET DEFAULT 350;

UPDATE "AiConfig"
SET
  "model" = 'gpt-4.1-nano',
  "maxTokens" = LEAST("maxTokens", 120),
  "maxChars" = LEAST("maxChars", 350),
  "dailyReplyLimit" = LEAST("dailyReplyLimit", 30),
  "historyMessages" = LEAST("historyMessages", 4);
