import fs from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { Express } from "express";
import sharp from "sharp";
import { v4 as uuid } from "uuid";
import { prisma } from "../lib/prisma";
import { config } from "../config";
import { sha256 } from "../lib/crypto";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

class MediaService {
  private s3?: S3Client;

  async saveUpload(file: Express.Multer.File) {
    if (!allowedTypes.has(file.mimetype)) {
      const error = new Error("Formato no permitido. Usa jpg, jpeg, png o webp.");
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const maxBytes = config.media.maxMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const error = new Error(`Imagen demasiado grande. Maximo ${config.media.maxMb} MB.`);
      (error as Error & { status?: number }).status = 400;
      throw error;
    }

    const image = sharp(file.buffer).rotate();
    const metadata = await image.metadata();
    const output = await image
      .resize({ width: 1800, height: 1800, fit: "inside", withoutEnlargement: true })
      .webp({ quality: file.size > 1_500_000 ? 78 : 88 })
      .toBuffer();

    const key = `${uuid()}.webp`;
    const checksum = sha256(output);
    const storage = config.media.storage;
    let url: string;

    if (storage === "s3") {
      await this.putS3(key, output, "image/webp");
      url = `${config.media.s3Endpoint?.replace(/\/$/, "")}/${config.media.s3Bucket}/${key}`;
    } else {
      await fs.mkdir(path.resolve(config.media.localDir), { recursive: true });
      await fs.writeFile(path.resolve(config.media.localDir, key), output);
      url = `/uploads/${key}`;
    }

    return prisma.mediaAsset.create({
      data: {
        key,
        url,
        storage,
        filename: key,
        originalName: file.originalname,
        mimeType: "image/webp",
        sizeBytes: output.length,
        width: metadata.width,
        height: metadata.height,
        checksum
      }
    });
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
    return prisma.mediaAsset.update({
      where: { id },
      data: { deletedAt: new Date() }
    });
  }
}

export const mediaService = new MediaService();
