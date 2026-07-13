import "dotenv/config";

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  encryptionKey: process.env.ENCRYPTION_KEY ?? "dev-only-change-me-please-32-chars",
  apiUrl: (process.env.API_URL ?? "http://localhost:4000").replace(/\/+$/, ""),
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? 10_000),
  maxSendAttempts: Number(process.env.WORKER_MAX_SEND_ATTEMPTS ?? 3),
  processingLockMs: Number(process.env.WORKER_PROCESSING_LOCK_MS ?? 5 * 60_000),
  timezone: process.env.DEFAULT_TIMEZONE ?? "America/La_Paz",
  telegram: {
    apiId: Number(process.env.TELEGRAM_API_ID ?? 0),
    apiHash: process.env.TELEGRAM_API_HASH ?? "",
    sessionLabel: process.env.TELEGRAM_SESSION_LABEL ?? "primary"
  },
  media: {
    localDir: process.env.MEDIA_LOCAL_DIR ?? "storage/media"
  }
};

export function workerConfigurationError() {
  const missing: string[] = [];
  if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (!config.telegram.apiId) missing.push("TELEGRAM_API_ID");
  if (!config.telegram.apiHash) missing.push("TELEGRAM_API_HASH");
  if (!process.env.ENCRYPTION_KEY || (config.nodeEnv === "production" && config.encryptionKey.startsWith("dev-only"))) {
    missing.push("ENCRYPTION_KEY");
  }
  return missing.length ? `Faltan variables en el Worker: ${missing.join(", ")}` : null;
}
