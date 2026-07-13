import fs from "node:fs/promises";
import path from "node:path";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Express } from "express";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { sha256 } from "../lib/crypto";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

class MediaService {
  private s3?: S3Client;

  async saveUpload(file: Express.Multer.File, options: { temporary?: boolean; ttlHours?: number } = {}) {
    return this.saveBuffer({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalName: file.originalname,
      size: file.size,
      temporary: options.temporary,
      ttlHours: options.ttlHours
    });
  }

  async saveBuffer(input: {
    buffer: Buffer;
    mimetype: string;
    originalName: string;
    size?: number;
    temporary?: boolean;
    ttlHours?: number;
  }) {
    if (!allowedTypes.has(input.mimetype)) {
      const error = new Error("Formato no permitido. Usa jpg, jpeg, png o webp.");
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const maxBytes = config.media.maxMb * 1024 * 1024;
    const maxInputBytes = input.temporary ? Math.max(maxBytes, 32 * 1024 * 1024) : maxBytes;
    if ((input.size ?? input.buffer.length) > maxInputBytes) {
      const error = new Error(`Imagen demasiado grande. Maximo ${Math.round(maxInputBytes / 1024 / 1024)} MB.`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const image = sharp(input.buffer).rotate();
    const metadata = await image.metadata();
    const output = await image
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: (input.size ?? input.buffer.length) > 1_500_000 ? 78 : 88 })
      .toBuffer();

    if (output.length > maxBytes) {
      const error = new Error(`La imagen comprimida supera el maximo de ${config.media.maxMb} MB.`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const key = `${uuid()}.webp`;
    const checksum = sha256(output);
    const storage = config.media.storage;
    let url: string;
    let content: Uint8Array<ArrayBuffer> | undefined;

    if (storage === "s3") {
      await this.putS3(key, output, "image/webp");
      url = `${config.media.s3Endpoint?.replace(/\/$/, "")}/${config.media.s3Bucket}/${key}`;
    } else if (storage === "local") {
      await fs.mkdir(path.resolve(config.media.localDir), { recursive: true });
      await fs.writeFile(path.resolve(config.media.localDir, key), output);
      url = `${config.apiUrl}/uploads/${key}`;
    } else {
      content = new Uint8Array(output);
      url = `${config.apiUrl}/media/${key}`;
    }

    const asset = await prisma.mediaAsset.create({
      data: {
        key,
        url,
        storage,
        filename: key,
        originalName: input.originalName,
        mimeType: "image/webp",
        sizeBytes: output.length,
        width: metadata.width,
        height: metadata.height,
        checksum,
        content,
        temporary: input.temporary ?? false,
        expiresAt: input.temporary ? new Date(Date.now() + (input.ttlHours ?? 24) * 60 * 60 * 1000) : undefined
      }
    });
    const { content: _content, ...safeAsset } = asset;
    return safeAsset;
  }

  private async putS3(key: string, body: Buffer, contentType: string) {
    if (!config.media.s3Bucket) throw new Error("S3_BUCKET no configurado");
    this.s3 ??= new S3Client({
      endpoint: config.media.s3Endpoint,
      region: config.media.s3Region,
      credentials: config.media.s3AccessKeyId
        ? {
            accessKeyId: config.media.s3AccessKeyId,
            secretAccessKey: config.media.s3SecretAccessKey ?? ""
          }
        : undefined,
      forcePathStyle: true
    });

    await this.s3.send(
      new PutObjectCommand({
        Bucket: config.media.s3Bucket,
        Key: key,
        Body: body,
        ContentType: contentType
      })
    );
  }

  async remove(id: string) {
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
    await this.deleteStoredFile(asset);
    const updated = await prisma.mediaAsset.update({ where: { id }, data: { deletedAt: new Date(), content: null } });
    const { content: _content, ...safeAsset } = updated;
    return safeAsset;
  }

  async cleanupExpiredTemporary() {
    const expired = await prisma.mediaAsset.findMany({
      where: {
        temporary: true,
        deletedAt: null,
        expiresAt: { lte: new Date() }
      },
      take: 100
    });

    for (const asset of expired) {
      await this.deleteStoredFile(asset).catch(() => undefined);
      await prisma.mediaAsset.update({
        where: { id: asset.id },
        data: { deletedAt: new Date(), content: null }
      });
    }

    return { count: expired.length };
  }

  private async deleteStoredFile(asset: { storage: string; filename: string; key: string }) {
    if (asset.storage === "database") return;
    if (asset.storage === "s3") {
      if (!config.media.s3Bucket) return;
      this.s3 ??= new S3Client({
        endpoint: config.media.s3Endpoint,
        region: config.media.s3Region,
        credentials: config.media.s3AccessKeyId
          ? {
              accessKeyId: config.media.s3AccessKeyId,
              secretAccessKey: config.media.s3SecretAccessKey ?? ""
            }
          : undefined,
        forcePathStyle: true
      });
      await this.s3.send(new DeleteObjectCommand({ Bucket: config.media.s3Bucket, Key: asset.key }));
      return;
    }

    await fs.rm(path.resolve(config.media.localDir, asset.filename), { force: true });
  }
}

export const mediaService = new MediaService();
