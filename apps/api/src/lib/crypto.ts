import crypto from "node:crypto";
import { config } from "../config";

function resolveKey() {
  const raw = config.encryptionKey;
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 32) return decoded;
  if (Buffer.byteLength(raw) === 32) return Buffer.from(raw);
  return crypto.createHash("sha256").update(raw).digest();
}

const key = resolveKey();

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${tag.toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload?: string | null) {
  if (!payload) return "";
  const [ivB64, tagB64, encryptedB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !encryptedB64) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedB64, "base64")),
    decipher.final()
  ]).toString("utf8");
}

export function sha256(value: Buffer | string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}
