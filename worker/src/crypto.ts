import crypto from "node:crypto";
import { config } from "./config";

function resolveKey() {
  const decoded = Buffer.from(config.encryptionKey, "base64");
  if (decoded.length === 32) return decoded;
  if (Buffer.byteLength(config.encryptionKey) === 32) return Buffer.from(config.encryptionKey);
  return crypto.createHash("sha256").update(config.encryptionKey).digest();
}

export function decryptSecret(payload?: string | null) {
  if (!payload) return "";
  const [ivB64, tagB64, encryptedB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !encryptedB64) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", resolveKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final()
  ]).toString("utf8");
}
