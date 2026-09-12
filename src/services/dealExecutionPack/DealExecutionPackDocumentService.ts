// @ts-nocheck
import crypto from "crypto";
import { randomUUID } from "crypto";
import { prisma } from "../../utils/database";
import { remoteUploadService, extractRelativeMediaPath } from "../RemoteUploadService";
import { DealExecutionPackAccessService } from "./DealExecutionPackAccessService";
import { DealExecutionPackAuditService } from "./DealExecutionPackAuditService";
import {
  assertPdfMagicBytes,
  DEP_AUDIT_EVENTS,
  DEP_DOC_STATUSES,
  DEP_PACK_STATUSES,
  PDF_MIME,
} from "./dealExecutionPackSupport";

function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export class DealExecutionPackDocumentService {
  static async listDocuments(packId: string) {
    const slots = await prisma.dealExecutionPackDocumentSlot.findMany({
      where: { packId },
      orderBy: { displayOrder: "asc" },
      include: {
        documents: { orderBy: { version: "desc" } },
      },
    });
    return slots.map((slot) => ({
      ...slot,
      activeDocument: slot.documents.find((d) => d.status === DEP_DOC_STATUSES.ACTIVE) ?? null,
    }));
  }

  static async upload(params: {
    packId: string;
    slotCode: string;
    file: Express.Multer.File;
    userId: string;
  }) {
    const pack = await DealExecutionPackAccessService.getPack(params.packId);
    if (pack.status === DEP_PACK_STATUSES.EXECUTED) {
      throw Object.assign(new Error("Pack is executed and locked"), { statusCode: 400 });
    }

    const slot = await prisma.dealExecutionPackDocumentSlot.findFirst({
      where: { packId: params.packId, slotCode: params.slotCode.toUpperCase() },
    });
    if (!slot) throw Object.assign(new Error("Document slot not found"), { statusCode: 404 });

    const buffer = params.file.buffer;
    if (!buffer?.length) throw new Error("File is empty");
    const fileName = params.file.originalname || "document.pdf";
    const mime = String(params.file.mimetype || PDF_MIME).toLowerCase();
    if (mime === PDF_MIME || fileName.toLowerCase().endsWith(".pdf")) {
      assertPdfMagicBytes(buffer);
    }

    const checksum = sha256(buffer);
    const upload = await remoteUploadService.uploadSingleFile(
      { buffer, originalname: fileName, mimetype: PDF_MIME },
      "deal-execution-pack"
    );
    const storagePath = extractRelativeMediaPath(upload.filePath || upload.downloadURL) || upload.filePath;

    const active = await prisma.dealExecutionPackDocument.findFirst({
      where: { slotId: slot.id, status: DEP_DOC_STATUSES.ACTIVE },
      orderBy: { version: "desc" },
    });
    const nextVersion = (active?.version ?? 0) + 1;

    const doc = await prisma.$transaction(async (tx) => {
      if (active) {
        await tx.dealExecutionPackDocument.update({
          where: { id: active.id },
          data: { status: DEP_DOC_STATUSES.SUPERSEDED },
        });
      }
      return tx.dealExecutionPackDocument.create({
        data: {
          id: randomUUID(),
          slotId: slot.id,
          version: nextVersion,
          status: DEP_DOC_STATUSES.ACTIVE,
          fileName,
          fileUrl: upload.downloadURL,
          storagePath,
          sha256: checksum,
          fileSizeBytes: buffer.length,
          uploadedById: params.userId,
        },
      });
    });

    const newStatus =
      pack.status === DEP_PACK_STATUSES.DRAFT ? DEP_PACK_STATUSES.IN_PROGRESS : pack.status;
    await prisma.dealExecutionPack.update({
      where: { id: pack.id },
      data: { status: newStatus },
    });

    await DealExecutionPackAuditService.log(pack.id, DEP_AUDIT_EVENTS.DOCUMENT_UPLOADED, params.userId, {
      slotCode: slot.slotCode,
      documentId: doc.id,
      version: doc.version,
      sha256: checksum,
      supersededId: active?.id ?? null,
    });
    if (active) {
      await DealExecutionPackAuditService.log(pack.id, DEP_AUDIT_EVENTS.DOCUMENT_SUPERSEDED, params.userId, {
        documentId: active.id,
        replacedBy: doc.id,
      });
    }

    return doc;
  }

  static async resolveDocument(packId: string, documentId: string) {
    const doc = await prisma.dealExecutionPackDocument.findUnique({
      where: { id: documentId },
      include: { slot: true },
    });
    if (!doc || doc.slot.packId !== packId) {
      throw Object.assign(new Error("Document not found"), { statusCode: 404 });
    }
    return doc;
  }

  static async fetchBuffer(doc: { storagePath: string | null; fileUrl: string }) {
    const path = doc.storagePath || doc.fileUrl;
    if (!path) throw new Error("Document has no storage path");
    return remoteUploadService.downloadFile(path);
  }

  static async verify(packId: string, documentId: string, actorId: string) {
    const doc = await DealExecutionPackDocumentService.resolveDocument(packId, documentId);
    const buffer = await DealExecutionPackDocumentService.fetchBuffer(doc);
    const actual = sha256(buffer);
    const ok = actual === doc.sha256;
    if (!ok) {
      await DealExecutionPackAuditService.log(packId, DEP_AUDIT_EVENTS.CHECKSUM_MISMATCH, actorId, {
        documentId,
        expected: doc.sha256,
        actual,
      });
    }
    return { ok, expectedSha256: doc.sha256, actualSha256: actual, documentId };
  }

  static async download(packId: string, documentId: string, actorId: string) {
    const doc = await DealExecutionPackDocumentService.resolveDocument(packId, documentId);
    const buffer = await DealExecutionPackDocumentService.fetchBuffer(doc);
    const actual = sha256(buffer);
    if (actual !== doc.sha256) {
      await DealExecutionPackAuditService.log(packId, DEP_AUDIT_EVENTS.CHECKSUM_MISMATCH, actorId, {
        documentId,
        expected: doc.sha256,
        actual,
        blockedDownload: true,
      });
      throw Object.assign(new Error("Document integrity check failed — download blocked"), { statusCode: 409 });
    }
    return { buffer, fileName: doc.fileName, mimeType: PDF_MIME };
  }
}
