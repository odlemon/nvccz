// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { FirebaseStorageService } from "./FirebaseStorageService";
import {
  remoteUploadService,
  extractRelativeMediaPath,
  rewritePublicMediaUrl
} from "./RemoteUploadService";
import { VendorDocumentUploadSettingsService } from "./VendorDocumentUploadSettingsService";
import {
  VENDOR_DOCUMENT_ENTITY_TYPES,
  VENDOR_DOCUMENT_STATUSES,
  VENDOR_DOCUMENT_UPLOAD_SOURCES,
  PDF_MIME,
  isVendorDocumentEntityType,
  type VendorDocumentEntityType
} from "../constants/vendorDocumentAttachment";
import { VENDOR_PORTAL_ACTOR_ID } from "../constants/vendorPortalActor";
import {
  verifyVendorPortalToken,
  VENDOR_PORTAL_KIND_RFQ_SUBMIT,
  VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE
} from "../utils/vendorPortalToken";

export type AttachmentActor =
  | { kind: "staff"; userId: string }
  | { kind: "portal"; vendorPortalToken: string };

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function guessMimeFromFileName(fileName: string): string {
  const n = String(fileName || "").toLowerCase();
  if (n.endsWith(".pdf")) return PDF_MIME;
  return "application/octet-stream";
}

function assertPdfMagicBytes(buffer: Buffer) {
  const head = buffer.subarray(0, 5).toString("ascii");
  if (!head.startsWith("%PDF-")) {
    throw new Error("PDF integrity check failed: file does not start with %PDF-");
  }
}

export class VendorDocumentAttachmentService {
  static async validateFile(buffer: Buffer, fileName: string, mimeType: string) {
    const settings = await VendorDocumentUploadSettingsService.getSettings();
    if (!buffer?.length) throw new Error("File is empty");
    if (buffer.length > settings.maxFileSizeBytes) {
      throw new Error(`File exceeds maximum size of ${settings.maxFileSizeBytes} bytes`);
    }

    const normalizedMime = String(mimeType || guessMimeFromFileName(fileName)).trim().toLowerCase();
    const ext = String(fileName || "")
      .toLowerCase()
      .split(".")
      .pop()
      ?.replace(/^\./, "");

    const allowed = settings.allowedFileTypes.filter((t) => t.enabled);
    const match = allowed.find((t) => {
      if (t.mimeType === normalizedMime) return true;
      if (ext && t.extensions?.includes(ext)) return true;
      return false;
    });
    if (!match) {
      throw new Error(`File type not allowed. Allowed: ${allowed.map((t) => t.label).join(", ")}`);
    }

    if (normalizedMime === PDF_MIME || ext === "pdf") {
      assertPdfMagicBytes(buffer);
    }

    return { settings, normalizedMime, match };
  }

  static resolvePortalContext(token: string, entityType: VendorDocumentEntityType) {
    const payload = verifyVendorPortalToken(token);
    if (entityType === VENDOR_DOCUMENT_ENTITY_TYPES.VENDOR_QUOTATION) {
      if (payload.k !== VENDOR_PORTAL_KIND_RFQ_SUBMIT) {
        throw new Error("Invalid portal token for quotation document upload");
      }
      return { vendorId: payload.v, portalTokenKind: payload.k };
    }
    if (entityType === VENDOR_DOCUMENT_ENTITY_TYPES.PROCUREMENT_INVOICE) {
      if (payload.k !== VENDOR_PORTAL_KIND_PO_VENDOR_INVOICE) {
        throw new Error("Invalid portal token for procurement invoice document upload");
      }
      return { vendorId: payload.v, portalTokenKind: payload.k, purchaseOrderId: payload.p };
    }
    throw new Error(`Portal upload not supported for entity type ${entityType}`);
  }

  static async assertEntityExists(entityType: VendorDocumentEntityType, entityId: string) {
    if (entityType === VENDOR_DOCUMENT_ENTITY_TYPES.VENDOR_QUOTATION) {
      const row = await prisma.vendorQuotation.findUnique({ where: { id: entityId } });
      if (!row) throw new Error("Quotation not found");
      return { vendorId: row.vendorId };
    }
    if (entityType === VENDOR_DOCUMENT_ENTITY_TYPES.PROCUREMENT_INVOICE) {
      const row = await prisma.procurementInvoice.findUnique({ where: { id: entityId } });
      if (!row) throw new Error("Procurement invoice not found");
      return { vendorId: row.vendorId };
    }
    if (entityType === VENDOR_DOCUMENT_ENTITY_TYPES.PURCHASE_INVOICE) {
      const row = await prisma.purchaseInvoice.findUnique({ where: { id: entityId } });
      if (!row) throw new Error("Purchase invoice not found");
      return { vendorId: row.vendorId };
    }
    throw new Error("Unknown entity type");
  }

  static async countActiveForEntity(entityType: string, entityId: string) {
    return prisma.vendorDocumentAttachment.count({
      where: { entityType, entityId, status: VENDOR_DOCUMENT_STATUSES.ACTIVE }
    });
  }

  static formatAttachmentResponse(row: any) {
    return {
      id: row.id,
      entityType: row.entityType,
      entityId: row.entityId,
      vendorId: row.vendorId,
      fileName: row.fileName,
      originalFileName: row.originalFileName,
      mimeType: row.mimeType,
      fileSizeBytes: row.fileSizeBytes,
      sha256Checksum: row.sha256Checksum,
      status: row.status,
      version: row.version,
      uploadSource: row.uploadSource,
      portalTokenKind: row.portalTokenKind,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    };
  }

  static async syncLegacyFields(entityType: VendorDocumentEntityType, entityId: string) {
    const active = (await prisma.vendorDocumentAttachment.findMany({
      where: {
        entityType,
        entityId,
        status: VENDOR_DOCUMENT_STATUSES.ACTIVE
      },
      orderBy: { createdAt: "asc" }
    })) ?? [];

    const jsonPayload = active.map((a) => ({
      attachmentId: a.id,
      fileName: a.originalFileName,
      mimeType: a.mimeType,
      fileUrl: rewritePublicMediaUrl(a.fileUrl) ?? a.fileUrl,
      sha256: a.sha256Checksum,
      uploadedAt: a.createdAt
    }));

    const primary = active[0];

    if (entityType === VENDOR_DOCUMENT_ENTITY_TYPES.VENDOR_QUOTATION) {
      await prisma.vendorQuotation.update({
        where: { id: entityId },
        data: { attachments: jsonPayload.length ? jsonPayload : null }
      });
    } else if (entityType === VENDOR_DOCUMENT_ENTITY_TYPES.PROCUREMENT_INVOICE && primary) {
      await prisma.procurementInvoice.update({
        where: { id: entityId },
        data: {
          documentPath: primary.fileUrl,
          documentType: primary.mimeType === PDF_MIME ? "PDF" : primary.mimeType
        }
      });
    }
  }

  static async audit(
    action: string,
    row: any,
    actor: AttachmentActor | null,
    meta?: { ipAddress?: string; userAgent?: string },
    extra?: Record<string, unknown>
  ) {
    await AuditService.log({
      userId: actor?.kind === "staff" ? actor.userId : undefined,
      action,
      entityType: "VendorDocumentAttachment",
      entityId: row.id,
      newValues: {
        entityType: row.entityType,
        entityId: row.entityId,
        vendorId: row.vendorId,
        attachmentId: row.id,
        fileName: row.originalFileName,
        mimeType: row.mimeType,
        sha256: row.sha256Checksum,
        uploadSource: row.uploadSource,
        ...extra
      },
      ipAddress: meta?.ipAddress,
      userAgent: meta?.userAgent
    }).catch((err) => console.error(`Audit log (${action}) failed:`, err));
  }

  static async upload(params: {
    file: Express.Multer.File;
    entityType: VendorDocumentEntityType;
    entityId?: string | null;
    actor: AttachmentActor;
    meta?: { ipAddress?: string; userAgent?: string };
  }) {
    if (!isVendorDocumentEntityType(params.entityType)) {
      throw new Error("Invalid entity type");
    }

    const buffer = params.file.buffer;
    const originalName = params.file.originalname || "document.pdf";
    const { normalizedMime, settings } = await this.validateFile(
      buffer,
      originalName,
      params.file.mimetype
    );

    let vendorId: string | null = null;
    let portalTokenKind: string | null = null;
    let uploadSource = VENDOR_DOCUMENT_UPLOAD_SOURCES.STAFF;
    let uploadedById: string | null = null;

    if (params.actor.kind === "portal") {
      const ctx = this.resolvePortalContext(params.actor.vendorPortalToken, params.entityType);
      vendorId = ctx.vendorId;
      portalTokenKind = ctx.portalTokenKind;
      uploadSource = VENDOR_DOCUMENT_UPLOAD_SOURCES.VENDOR_PORTAL;
      uploadedById = null;
    } else {
      uploadedById = params.actor.userId;
      if (params.entityId) {
        const ent = await this.assertEntityExists(params.entityType, params.entityId);
        vendorId = ent.vendorId;
      }
    }

    if (params.entityId) {
      const count = await this.countActiveForEntity(params.entityType, params.entityId);
      if (count >= settings.maxAttachmentsPerRecord) {
        throw new Error(`Maximum ${settings.maxAttachmentsPerRecord} attachments per record reached`);
      }
    }

    const checksum = sha256(buffer);
    const vendorKey = (vendorId || "staged")
      .replace(/[^a-zA-Z0-9.\-_]/g, "_")
      .slice(0, 64);
    const folderKey = `${params.entityType}/${vendorKey}`;

    const { filePath, downloadURL } = await FirebaseStorageService.uploadVendorRecordAttachment(
      buffer,
      originalName,
      folderKey,
      normalizedMime
    );

    const row = await prisma.vendorDocumentAttachment.create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        vendorId,
        fileName: originalName,
        originalFileName: originalName,
        mimeType: normalizedMime,
        fileSizeBytes: buffer.length,
        fileUrl: downloadURL,
        storagePath: filePath,
        sha256Checksum: checksum,
        status: VENDOR_DOCUMENT_STATUSES.ACTIVE,
        version: 1,
        uploadedById,
        uploadSource,
        portalTokenKind
      }
    });

    if (params.entityId) {
      await this.syncLegacyFields(params.entityType, params.entityId);
    }

    await this.audit("VENDOR_DOCUMENT_UPLOADED", row, params.actor, params.meta);

    return this.formatAttachmentResponse(row);
  }

  static async linkStagedAttachments(params: {
    attachmentIds: string[];
    entityType: VendorDocumentEntityType;
    entityId: string;
    vendorId?: string | null;
    meta?: { ipAddress?: string; userAgent?: string };
    actorUserId?: string | null;
  }) {
    if (!params.attachmentIds?.length) return [];

    const settings = await VendorDocumentUploadSettingsService.getSettings();
    const existing = await this.countActiveForEntity(params.entityType, params.entityId);
    if (existing + params.attachmentIds.length > settings.maxAttachmentsPerRecord) {
      throw new Error(`Cannot link more than ${settings.maxAttachmentsPerRecord} attachments`);
    }

    const ent = await this.assertEntityExists(params.entityType, params.entityId);
    const expectedVendorId = params.vendorId ?? ent.vendorId;

    const linked = [];
    for (const id of params.attachmentIds) {
      const row = await prisma.vendorDocumentAttachment.findUnique({ where: { id } });
      if (!row || row.status !== VENDOR_DOCUMENT_STATUSES.ACTIVE) {
        throw new Error(`Attachment ${id} not found or not active`);
      }
      if (row.entityType !== params.entityType) {
        throw new Error(`Attachment ${id} entity type mismatch`);
      }
      if (row.entityId && row.entityId !== params.entityId) {
        throw new Error(`Attachment ${id} is already linked to another record`);
      }
      if (expectedVendorId && row.vendorId && row.vendorId !== expectedVendorId) {
        throw new Error(`Attachment ${id} vendor mismatch`);
      }

      const updated = await prisma.vendorDocumentAttachment.update({
        where: { id },
        data: {
          entityId: params.entityId,
          vendorId: row.vendorId ?? expectedVendorId
        }
      });
      linked.push(this.formatAttachmentResponse(updated));
    }

    await this.syncLegacyFields(params.entityType, params.entityId);

    for (const item of linked) {
      await this.audit(
        "VENDOR_DOCUMENT_UPLOADED",
        { ...item, id: item.id },
        params.actorUserId ? { kind: "staff", userId: params.actorUserId } : null,
        params.meta,
        { linked: true, entityId: params.entityId }
      );
    }

    return linked;
  }

  static async listAttachments(entityType: VendorDocumentEntityType, entityId: string, actor: AttachmentActor) {
    await this.assertAccessToEntity(entityType, entityId, actor);

    const rows = await prisma.vendorDocumentAttachment.findMany({
      where: {
        entityType,
        entityId,
        status: { in: [VENDOR_DOCUMENT_STATUSES.ACTIVE] }
      },
      orderBy: { createdAt: "asc" }
    });

    if (actor.kind === "staff") {
      await AuditService.log({
        userId: actor.userId,
        action: "VENDOR_DOCUMENT_LISTED",
        entityType: "VendorDocumentAttachment",
        entityId: entityId,
        newValues: { entityType, entityId, count: rows.length }
      }).catch(() => undefined);
    }

    return rows.map((r) => this.formatAttachmentResponse(r));
  }

  static async assertAccessToAttachment(attachmentId: string, actor: AttachmentActor) {
    const row = await prisma.vendorDocumentAttachment.findUnique({ where: { id: attachmentId } });
    if (!row || row.status === VENDOR_DOCUMENT_STATUSES.DELETED) {
      throw new Error("Attachment not found");
    }

    if (actor.kind === "staff") {
      return row;
    }

    const ctx = this.resolvePortalContext(actor.vendorPortalToken, row.entityType);
    if (row.vendorId && row.vendorId !== ctx.vendorId) {
      throw new Error("Access denied");
    }
    if (row.entityType === VENDOR_DOCUMENT_ENTITY_TYPES.VENDOR_QUOTATION && row.entityId) {
      const q = await prisma.vendorQuotation.findUnique({ where: { id: row.entityId } });
      if (!q || q.vendorId !== ctx.vendorId) throw new Error("Access denied");
    }
    if (row.entityType === VENDOR_DOCUMENT_ENTITY_TYPES.PROCUREMENT_INVOICE && row.entityId) {
      const inv = await prisma.procurementInvoice.findUnique({ where: { id: row.entityId } });
      if (!inv || inv.vendorId !== ctx.vendorId) throw new Error("Access denied");
    }
    if (!row.entityId && row.vendorId !== ctx.vendorId) {
      throw new Error("Access denied");
    }

    return row;
  }

  static async assertAccessToEntity(
    entityType: VendorDocumentEntityType,
    entityId: string,
    actor: AttachmentActor
  ) {
    const ent = await this.assertEntityExists(entityType, entityId);
    if (actor.kind === "staff") return ent;
    const ctx = this.resolvePortalContext(actor.vendorPortalToken, entityType);
    if (ent.vendorId && ent.vendorId !== ctx.vendorId) {
      throw new Error("Access denied");
    }
    return ent;
  }

  static async getFileBuffer(attachmentId: string, actor: AttachmentActor) {
    const row = await this.assertAccessToAttachment(attachmentId, actor);
    const url = row.fileUrl && String(row.fileUrl).trim();
    if (!url) throw new Error("Attachment has no file URL");

    let raw: Buffer;
    try {
      const axios = (await import("axios")).default;
      const fetchUrl = rewritePublicMediaUrl(url) ?? url;
      const res = await axios.get(fetchUrl, { responseType: "arraybuffer", timeout: 60000 });
      raw = Buffer.from(res.data);
    } catch {
      const rel = extractRelativeMediaPath(url);
      raw = await remoteUploadService.downloadFile(rel || url);
    }

    const computed = sha256(raw);
    if (computed !== row.sha256Checksum) {
      throw new Error("File integrity check failed: checksum mismatch");
    }

    await this.audit("VENDOR_DOCUMENT_DOWNLOADED", row, actor);

    return {
      buffer: raw,
      fileName: row.originalFileName,
      mimeType: row.mimeType
    };
  }

  static async replaceAttachment(params: {
    attachmentId: string;
    file: Express.Multer.File;
    actor: AttachmentActor;
    meta?: { ipAddress?: string; userAgent?: string };
  }) {
    const existing = await this.assertAccessToAttachment(params.attachmentId, params.actor);
    if (existing.status !== VENDOR_DOCUMENT_STATUSES.ACTIVE) {
      throw new Error("Only active attachments can be replaced");
    }
    if (params.actor.kind === "portal") {
      throw new Error("Portal users cannot replace attachments; upload a new staged file before submit");
    }

    const buffer = params.file.buffer;
    const originalName = params.file.originalname || existing.originalFileName;
    const { normalizedMime } = await this.validateFile(buffer, originalName, params.file.mimetype);
    const checksum = sha256(buffer);

    const vendorKey = (existing.vendorId || "staff")
      .replace(/[^a-zA-Z0-9.\-_]/g, "_")
      .slice(0, 64);
    const folderKey = `${existing.entityType}/${vendorKey}`;

    const { filePath, downloadURL } = await FirebaseStorageService.uploadVendorRecordAttachment(
      buffer,
      originalName,
      folderKey,
      normalizedMime
    );

    await prisma.vendorDocumentAttachment.update({
      where: { id: existing.id },
      data: { status: VENDOR_DOCUMENT_STATUSES.SUPERSEDED }
    });

    const row = await prisma.vendorDocumentAttachment.create({
      data: {
        entityType: existing.entityType,
        entityId: existing.entityId,
        vendorId: existing.vendorId,
        fileName: originalName,
        originalFileName: originalName,
        mimeType: normalizedMime,
        fileSizeBytes: buffer.length,
        fileUrl: downloadURL,
        storagePath: filePath,
        sha256Checksum: checksum,
        status: VENDOR_DOCUMENT_STATUSES.ACTIVE,
        version: existing.version + 1,
        uploadedById: params.actor.kind === "staff" ? params.actor.userId : VENDOR_PORTAL_ACTOR_ID,
        uploadSource: VENDOR_DOCUMENT_UPLOAD_SOURCES.STAFF,
        portalTokenKind: existing.portalTokenKind
      }
    });

    if (existing.entityId) {
      await this.syncLegacyFields(existing.entityType, existing.entityId);
    }

    await this.audit("VENDOR_DOCUMENT_REPLACED", row, params.actor, params.meta, {
      replacedAttachmentId: existing.id
    });

    return this.formatAttachmentResponse(row);
  }

  static async deleteAttachment(params: {
    attachmentId: string;
    actor: AttachmentActor;
    meta?: { ipAddress?: string; userAgent?: string };
  }) {
    const row = await this.assertAccessToAttachment(params.attachmentId, params.actor);
    if (params.actor.kind === "portal") {
      throw new Error("Portal users cannot delete attachments");
    }

    const updated = await prisma.vendorDocumentAttachment.update({
      where: { id: row.id },
      data: {
        status: VENDOR_DOCUMENT_STATUSES.DELETED,
        deletedAt: new Date(),
        deletedById: params.actor.userId
      }
    });

    if (row.entityId) {
      await this.syncLegacyFields(row.entityType, row.entityId);
    }

    await this.audit("VENDOR_DOCUMENT_DELETED", updated, params.actor, params.meta);

    return this.formatAttachmentResponse(updated);
  }
}
