// @ts-nocheck
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const s3 = new S3Client({
  region: "eu-north-1",
  credentials: {
    accessKeyId: "AKIAYLERNOX7ATX3MPMP",
    secretAccessKey: "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"
  }
});
const BUCKET_NAME = "lysp";

export async function uploadToS3(buffer: Buffer, key: string, mimetype: string): Promise<string> {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype
  }));
  return `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;
} 