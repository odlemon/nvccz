// @ts-nocheck
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "../../utils/database";
import { LpPortalError } from "../../middleware/lpPortalFoundation";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";

const db = () => prisma as any;

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "lp-portal-attachments");

function ensureUploadDir(clientId: string) {
  const dir = path.join(UPLOAD_ROOT, clientId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export class LpPortalAttachmentService {
  static async uploadRequestAttachment(
    ctx: LpPortalContext,
    file: { buffer: Buffer; originalname: string; mimetype?: string; size?: number },
    userId?: string
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    if (!file?.buffer?.length) {
      throw new LpPortalError("LP_VALIDATION", "file is required", 422, { file: "Required" });
    }

    const dir = ensureUploadDir(ctx.clientId);
    const id = `att_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
    const safeName = file.originalname.replace(/[^\w.-]+/g, "-").slice(0, 200);
    const storagePath = path.join(dir, `${id}_${safeName}`);
    fs.writeFileSync(storagePath, file.buffer);
    const sha256 = crypto.createHash("sha256").update(file.buffer).digest("hex");

    const row = await db().lpPortalAttachment.create({
      data: {
        id,
        clientId: ctx.clientId,
        fileName: file.originalname,
        mimeType: file.mimetype || "application/octet-stream",
        storagePath,
        fileSizeBytes: BigInt(file.size ?? file.buffer.length),
        sha256,
        uploadedById: userId || ctx.userId || null,
      },
    });

    return this.mapAttachment(row);
  }

  static async linkToRequest(ctx: LpPortalContext, attachmentIds: string[], requestId: string) {
    if (!attachmentIds?.length) return;
    await db().lpPortalAttachment.updateMany({
      where: { id: { in: attachmentIds }, clientId: ctx.clientId, requestId: null },
      data: { requestId },
    });
  }

  static async linkToMessage(ctx: LpPortalContext, attachmentIds: string[], messageId: string) {
    if (!attachmentIds?.length) return;
    await db().lpPortalAttachment.updateMany({
      where: { id: { in: attachmentIds }, clientId: ctx.clientId, messageId: null },
      data: { messageId },
    });
  }

  static async listForRequest(ctx: LpPortalContext, requestId: string) {
    const rows = await db().lpPortalAttachment.findMany({
      where: { clientId: ctx.clientId, requestId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r: any) => this.mapAttachment(r));
  }

  static async listForMessages(ctx: LpPortalContext, messageIds: string[]) {
    if (!messageIds.length) return new Map<string, any[]>();
    const rows = await db().lpPortalAttachment.findMany({
      where: { clientId: ctx.clientId, messageId: { in: messageIds } },
    });
    const byMsg = new Map<string, any[]>();
    for (const r of rows) {
      const list = byMsg.get(r.messageId) || [];
      list.push(this.mapAttachment(r));
      byMsg.set(r.messageId, list);
    }
    return byMsg;
  }

  static async validateAttachmentIds(ctx: LpPortalContext, attachmentIds?: string[]) {
    if (!attachmentIds?.length) return;
    const rows = await db().lpPortalAttachment.findMany({
      where: { id: { in: attachmentIds }, clientId: ctx.clientId },
    });
    if (rows.length !== attachmentIds.length) {
      throw new LpPortalError("LP_VALIDATION", "Invalid attachmentIds", 422, {
        attachmentIds: "One or more attachments not found",
      });
    }
  }

  static async download(ctx: LpPortalContext, attachmentId: string) {
    const row = await db().lpPortalAttachment.findUnique({ where: { id: attachmentId } });
    if (!row || row.clientId !== ctx.clientId) {
      throw new LpPortalError("LP_NOT_FOUND", "Attachment not found", 404);
    }
    if (!fs.existsSync(row.storagePath)) {
      throw new LpPortalError("LP_NOT_FOUND", "Attachment file missing", 404);
    }
    return {
      buffer: fs.readFileSync(row.storagePath),
      filename: row.fileName,
      contentType: row.mimeType,
    };
  }

  private static mapAttachment(r: any) {
    const size =
      r.fileSizeBytes != null
        ? Number(typeof r.fileSizeBytes === "bigint" ? r.fileSizeBytes : r.fileSizeBytes)
        : null;
    return {
      id: r.id,
      name: r.fileName,
      size,
      mimeType: r.mimeType,
      downloadUrl: `/api/lp-portal/attachments/${r.id}/download`,
      createdAt: r.createdAt?.toISOString?.() ?? null,
    };
  }
}
