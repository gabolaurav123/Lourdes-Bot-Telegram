import "dotenv/config";

export const config = {
  encryptionKey: process.env.ENCRYPTION_KEY ?? "dev-only-change-me-please-32-chars",
  telegram: {
    apiId: Number(process.env.TELEGRAM_API_ID ?? 0),
    apiHash: process.env.TELEGRAM_API_HASH ?? "",
    sessionLabel: process.env.TELEGRAM_SESSION_LABEL ?? "primary"
  },
  media: {
    localDir: process.env.MEDIA_LOCAL_DIR ?? "storage/media"
  }
};
