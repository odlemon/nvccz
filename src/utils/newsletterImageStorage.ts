// @ts-nocheck
/**
 * Persist newsletter cover images on disk and return a stable public HTTPS URL for `Newsletter.imageUrl`.
 * Served by Express at `{origin}/api/uploads/newsletters/:file`.
 *
 * Override base with `PUBLIC_ASSET_BASE_URL` (no trailing slash), e.g. `https://api.example.com`
 */
import fs from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const STATIC_MOUNT_PREFIX = "/api/uploads/newsletters";

function pickExtension(originalName: string, mimeType: string): string {
  const fromName = path.extname(originalName || "").replace(".", "").toLowerCase();
  if (fromName === "jpeg" || fromName === "jpg") return "jpg";
  if (["png", "gif", "webp", "jpg"].includes(fromName)) return fromName;
  const m = String(mimeType || "").toLowerCase();
  if (m.includes("png")) return "png";
  if (m.includes("gif")) return "gif";
  if (m.includes("webp")) return "webp";
  return "jpg";
}

/** Public absolute URL stored on `performance_goals` / newsletter row. */
export function buildNewsletterImagePublicUrl(savedFileName: string): string {
  const trimmed = savedFileName.replace(/^\/+/, "");
  const explicitBase = process.env.PUBLIC_ASSET_BASE_URL?.trim()?.replace(/\/$/, "");
  if (explicitBase) {
    return `${explicitBase}${STATIC_MOUNT_PREFIX}/${trimmed}`;
  }
  const port = process.env.PORT || "3000";
  const host = process.env.SERVER_HOST || "127.0.0.1";
  return `http://${host}:${port}${STATIC_MOUNT_PREFIX}/${trimmed}`;
}

/**
 * Writes buffer under `uploads/newsletters/` and returns the **full URL** clients should persist (e.g. in `imageUrl`).
 */
export async function saveNewsletterCoverImage(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new Error("Newsletter image is empty");
  }
  const dir = path.join(process.cwd(), "uploads", "newsletters");
  await fs.mkdir(dir, { recursive: true });
  const ext = pickExtension(originalName, mimeType);
  const safe = `${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  await fs.writeFile(path.join(dir, safe), buffer);
  return buildNewsletterImagePublicUrl(safe);
}
