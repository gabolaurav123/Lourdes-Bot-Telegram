import "dotenv/config";

function required(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing environment variable ${name}`);
  }
  return value;
}

function cleanUrl(value: string) {
  return value.replace(/\/$/, "");
}

function listEnv(name: string, fallback: string) {
  return (process.env[name] ?? fallback)
    .split(",")
    .map((value) => cleanUrl(value.trim()))
    .filter(Boolean);
}

const appUrl = cleanUrl(process.env.APP_URL ?? "http://localhost:5173");

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  apiPort: Number(process.env.PORT ?? process.env.API_PORT ?? 4000),
  appUrl,
  corsOrigins: listEnv("CORS_ORIGINS", appUrl),
  apiUrl: cleanUrl(process.env.API_URL ?? "http://localhost:4000"),
  jwtSecret: required("JWT_SECRET", "dev-only-change-me-please-32-chars"),
  encryptionKey: required("ENCRYPTION_KEY", "dev-only-change-me-please-32-chars"),
  telegram: {
    apiId: Number(process.env.TELEGRAM_API_ID ?? 0),
    apiHash: process.env.TELEGRAM_API_HASH ?? "",
    sessionLabel: process.env.TELEGRAM_SESSION_LABEL ?? "primary"
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? "",
    model: process.env.OPENAI_MODEL ?? "gpt-4.1-mini"
  },
  media: {
    storage: process.env.MEDIA_STORAGE ?? "local",
    localDir: process.env.MEDIA_LOCAL_DIR ?? "storage/media",
    maxMb: Number(process.env.MEDIA_MAX_MB ?? 8),
    s3Endpoint: process.env.S3_ENDPOINT,
    s3Region: process.env.S3_REGION,
    s3Bucket: process.env.S3_BUCKET,
    s3AccessKeyId: process.env.S3_ACCESS_KEY_ID,
    s3SecretAccessKey: process.env.S3_SECRET_ACCESS_KEY
  }
};
