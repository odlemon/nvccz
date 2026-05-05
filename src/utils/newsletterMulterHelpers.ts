// @ts-nocheck
import type { Request } from "express";

/**
 * After `multer().fields([{ name: "image", maxCount: 1 }, { name: "coverImage", maxCount: 1 }])`,
 * resolves the newsletter cover file (`image` or `coverImage` field).
 */
export function getUploadedNewsletterCoverFile(req: Request): Express.Multer.File | undefined {
  const f = req.files as Record<string, Express.Multer.File[]> | undefined;
  if (!f || typeof f !== "object") {
    return req.file;
  }
  const fromImage = f.image?.[0];
  const fromCoverImage = f.coverImage?.[0];
  return fromImage ?? fromCoverImage ?? req.file ?? undefined;
}
