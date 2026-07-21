// @ts-nocheck
import { createHash, randomUUID } from "crypto";
import { createReadStream } from "fs";
import { access, mkdir, writeFile } from "fs/promises";
import path from "path";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";
import { InvestmentJobWorkerService } from "./InvestmentJobWorkerService";
import { paginatedResult, parsePagination } from "./investmentOpsSupport";

const db = prisma as any;

const STORAGE_ROOT = path.resolve(
  process.cwd(),
  "storage",
  "local-upload-mock",
  "investment-ops-docs"
);
const LOCAL_MOCK_ROOT = path.resolve(process.cwd(), "storage", "local-upload-mock");

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "text/csv",
  "text/plain",
  "application/json",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_BYTES = 25 * 1024 * 1024;

function fail(code: string, message: string, status = 400, details: unknown = null): never {
  throw new InvestmentOpsError(code, message, status, details);
}

function sanitizeFileName(name: string) {
  return String(name || "file")
    .replace(/[^\w.\- ()]/g, "_")
    .replace(/\.\.+/g, ".")
    .slice(0, 180);
}

function contentDisposition(fileName: string, inline = false) {
  const safe = sanitizeFileName(fileName).replace(/"/g, "");
  return `${inline ? "inline" : "attachment"}; filename="${safe}"`;
}

async function assertUnderStorage(resolvedPath: string) {
  const normalized = path.resolve(resolvedPath);
  if (!normalized.startsWith(STORAGE_ROOT + path.sep) && normalized !== STORAGE_ROOT) {
    fail("UNSAFE_FILE_PATH", "File path is outside the controlled storage root", 400);
  }
  return normalized;
}

async function documentAccess(documentId: string, userId: string, user: any, permission = "READ") {
  const document = await db.investmentDocument.findUnique({
    where: { id: documentId },
    include: {
      versions: { orderBy: { versionNo: "desc" } },
      aclEntries: true,
      links: true,
    },
  });
  if (!document || document.isDeleted) fail("DOCUMENT_NOT_FOUND", "Document not found", 404);
  if (document.fundId) {
    await ListedEquityAccessService.assertFundAccess(userId, document.fundId, user);
  }
  const acl = (document.aclEntries || []).filter((a: any) => !a.revokedAt);
  if (acl.length) {
    const isUploader = document.uploadedById === userId;
    const grants = new Set(
      acl
        .filter((a: any) => a.principalType === "USER" && a.principalId === userId)
        .map((a: any) => a.permission)
    );
    const canRead =
      grants.has("READ") ||
      grants.has("WRITE") ||
      grants.has("ADMIN") ||
      grants.has("DOWNLOAD");
    const canWrite = grants.has("WRITE") || grants.has("ADMIN");
    const canAdmin = grants.has("ADMIN");
    const canDownload = canRead;
    let ok = false;
    if (permission === "READ" || permission === "DOWNLOAD") ok = canRead;
    else if (permission === "WRITE") ok = canWrite;
    else if (permission === "ADMIN") ok = canAdmin;
    if (!ok && !isUploader) {
      fail("DOCUMENT_ACCESS_DENIED", "You do not have access to this document", 403);
    }
  }
  return document;
}

function sha256(buf: Buffer) {
  return createHash("sha256").update(buf).digest("hex");
}

export function assertNoCallerFileRef(fileRef?: string | null) {
  if (fileRef) {
    fail(
      "FILE_REF_FORBIDDEN",
      "Caller-controlled fileRef paths are not allowed; use upload sessions",
      400
    );
  }
}

export class InvestmentDocumentationService {
  static async createUploadSession(
    data: {
      fundId?: string;
      fileName: string;
      mimeType: string;
      byteSize: number | string;
      checksumSha256?: string;
    },
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    if (data.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, data.fundId, user);
    }
    const mimeType = String(data.mimeType || "").toLowerCase();
    const byteSize = Number(data.byteSize);
    if (!ALLOWED_MIME.has(mimeType)) {
      fail("UNSUPPORTED_MIME_TYPE", `MIME type ${mimeType} is not allowed`, 415, {
        allowed: [...ALLOWED_MIME],
      });
    }
    if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_BYTES) {
      fail("INVALID_FILE_SIZE", `byteSize must be between 1 and ${MAX_BYTES}`, 400);
    }

    const existing = await db.investmentJob.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return {
        uploadSessionId: existing.id,
        fileId: existing.id,
        status: (existing.payloadJson as any)?.status || existing.status,
        ...(existing.payloadJson as object),
      };
    }

    const job = await InvestmentJobWorkerService.enqueue({
      jobType: "FILE_UPLOAD_SESSION",
      aggregateType: "FileUpload",
      aggregateId: data.fundId || null,
      payloadJson: {
        status: "AWAITING_UPLOAD",
        fundId: data.fundId || null,
        fileName: sanitizeFileName(data.fileName),
        mimeType,
        byteSize,
        expectedChecksumSha256: data.checksumSha256 || null,
        uploadedById: userId,
        malwareStatus: "PENDING",
        storageKey: null,
      },
      idempotencyKey,
      priority: 90,
    });

    return {
      uploadSessionId: job.id,
      fileId: job.id,
      status: "AWAITING_UPLOAD",
      maxBytes: MAX_BYTES,
      allowedMimeTypes: [...ALLOWED_MIME],
    };
  }

  static async uploadFile(
    data: {
      uploadSessionId?: string;
      fileId?: string;
      contentBase64: string;
      checksumSha256?: string;
    },
    userId: string,
    user: any
  ) {
    const fileId = data.uploadSessionId || data.fileId;
    if (!fileId) fail("VALIDATION_ERROR", "uploadSessionId or fileId is required");
    if (!data.contentBase64) fail("VALIDATION_ERROR", "contentBase64 is required");

    const job = await db.investmentJob.findUnique({ where: { id: fileId } });
    if (!job || job.jobType !== "FILE_UPLOAD_SESSION") {
      fail("UPLOAD_SESSION_NOT_FOUND", "Upload session not found", 404);
    }
    const payload = { ...(job.payloadJson as any) };
    if (payload.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, payload.fundId, user);
    }
    if (!["AWAITING_UPLOAD", "UPLOADED", "SCAN_PENDING"].includes(payload.status)) {
      fail("UPLOAD_SESSION_CLOSED", "Upload session is not accepting bytes", 409, {
        status: payload.status,
      });
    }

    const buffer = Buffer.from(data.contentBase64, "base64");
    if (buffer.byteLength !== Number(payload.byteSize)) {
      fail("FILE_SIZE_MISMATCH", "Uploaded byte length does not match session byteSize", 400, {
        expected: payload.byteSize,
        actual: buffer.byteLength,
      });
    }
    const checksum = sha256(buffer);
    if (payload.expectedChecksumSha256 && payload.expectedChecksumSha256 !== checksum) {
      fail("CHECKSUM_MISMATCH", "Checksum does not match session expectation", 400);
    }
    if (data.checksumSha256 && data.checksumSha256 !== checksum) {
      fail("CHECKSUM_MISMATCH", "Provided checksum does not match content", 400);
    }

    await mkdir(STORAGE_ROOT, { recursive: true });
    const storageKey = path.join("sessions", job.id, sanitizeFileName(payload.fileName));
    const absolute = await assertUnderStorage(path.join(STORAGE_ROOT, storageKey));
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, buffer);

    const nextPayload = {
      ...payload,
      status: "UPLOADED",
      storageKey,
      storageProvider: "LOCAL",
      checksumSha256: checksum,
      malwareStatus: "SCAN_PENDING",
      uploadedAt: new Date().toISOString(),
    };
    await db.investmentJob.update({
      where: { id: job.id },
      data: { payloadJson: nextPayload, status: "RUNNING" },
    });

    return {
      fileId: job.id,
      status: nextPayload.status,
      checksumSha256: checksum,
      malwareStatus: nextPayload.malwareStatus,
      byteSize: buffer.byteLength,
    };
  }

  static async completeFile(fileId: string, userId: string, user: any) {
    const job = await db.investmentJob.findUnique({ where: { id: fileId } });
    if (!job || job.jobType !== "FILE_UPLOAD_SESSION") {
      fail("UPLOAD_SESSION_NOT_FOUND", "Upload session not found", 404);
    }
    const payload = { ...(job.payloadJson as any) };
    if (payload.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, payload.fundId, user);
    }
    if (!payload.storageKey || !payload.checksumSha256) {
      fail("FILE_NOT_UPLOADED", "File bytes must be uploaded before complete", 409);
    }
    const absolute = await assertUnderStorage(path.join(STORAGE_ROOT, payload.storageKey));
    await access(absolute);

    // In-process "scan" — mark clean unless content looks like eicar signature
    const { readFile } = await import("fs/promises");
    const bytes = await readFile(absolute);
    const textHead = bytes.slice(0, 200).toString("utf8");
    const malwareStatus = /EICAR-STANDARD-ANTIVIRUS-TEST-FILE/i.test(textHead)
      ? "MALWARE_DETECTED"
      : "CLEAN";

    const nextPayload = {
      ...payload,
      status: malwareStatus === "CLEAN" ? "READY" : "REJECTED",
      malwareStatus,
      completedAt: new Date().toISOString(),
    };
    await db.investmentJob.update({
      where: { id: job.id },
      data: {
        payloadJson: nextPayload,
        status: malwareStatus === "CLEAN" ? "COMPLETED" : "FAILED",
        completedAt: new Date(),
        lastError: malwareStatus === "CLEAN" ? null : "Malware detected",
      },
    });

    await InvestmentOpsAuditService.log(
      "FILE_UPLOAD_COMPLETED",
      "FileUpload",
      fileId,
      { malwareStatus, checksumSha256: payload.checksumSha256 },
      userId
    );

    return {
      fileId,
      status: nextPayload.status,
      malwareStatus,
      checksumSha256: payload.checksumSha256,
      storageKey: payload.storageKey,
    };
  }

  static async fileStatus(fileId: string, userId: string, user: any) {
    const job = await db.investmentJob.findUnique({ where: { id: fileId } });
    if (!job || job.jobType !== "FILE_UPLOAD_SESSION") {
      fail("UPLOAD_SESSION_NOT_FOUND", "Upload session not found", 404);
    }
    const payload = job.payloadJson as any;
    if (payload.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, payload.fundId, user);
    }
    return {
      fileId,
      jobStatus: job.status,
      status: payload.status,
      malwareStatus: payload.malwareStatus,
      mimeType: payload.mimeType,
      byteSize: payload.byteSize,
      checksumSha256: payload.checksumSha256 || null,
      fileName: payload.fileName,
    };
  }

  static async list(userId: string, user: any, filters: any = {}) {
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    const where: any = { isDeleted: false };
    if (filters.fundId) {
      Object.assign(
        where,
        await ListedEquityAccessService.accessibleFundIdFilter(userId, user, filters.fundId)
      );
    } else if (scope !== "ALL") {
      where.OR = [{ fundId: { in: scope } }, { fundId: null }];
    }
    if (filters.documentType) where.documentType = filters.documentType;
    if (filters.approvalStatus) where.approvalStatus = filters.approvalStatus;
    const page = parsePagination(filters);
    const [rows, total] = await Promise.all([
      db.investmentDocument.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
        include: { versions: { orderBy: { versionNo: "desc" }, take: 1 } },
      }),
      db.investmentDocument.count({ where }),
    ]);
    return paginatedResult(rows, total, page.page, page.pageSize);
  }

  static async createDocument(
    data: {
      fundId?: string;
      documentType: string;
      title: string;
      fileId?: string;
      orderId?: string;
      tradeId?: string;
      classification?: string;
      /** @deprecated unsafe — rejected */
      fileRef?: string;
      contentBase64?: string;
    },
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    if (data.fileRef) {
      assertNoCallerFileRef(data.fileRef);
    }

    let fundId = data.fundId;
    if (!fundId && data.orderId) {
      fundId = (
        await db.investmentOrder.findUnique({ where: { id: data.orderId }, select: { fundId: true } })
      )?.fundId;
      if (!fundId) fail("ORDER_NOT_FOUND", "Order not found", 404);
    }
    if (!fundId && data.tradeId) {
      fundId = (
        await db.listedEquityTrade.findUnique({
          where: { id: data.tradeId },
          select: { fundId: true },
        })
      )?.fundId;
      if (!fundId) fail("TRADE_NOT_FOUND", "Trade not found", 404);
    }
    if (fundId) await ListedEquityAccessService.assertFundAccess(userId, fundId, user);

    const existingJob = await db.investmentJob.findUnique({ where: { idempotencyKey } });
    if (existingJob?.payloadJson?.documentId) {
      return this.get(existingJob.payloadJson.documentId, userId, user);
    }

    let filePayload: any = null;
    if (data.fileId) {
      const fileJob = await db.investmentJob.findUnique({ where: { id: data.fileId } });
      if (!fileJob || fileJob.jobType !== "FILE_UPLOAD_SESSION") {
        fail("FILE_NOT_FOUND", "Completed file upload not found", 404);
      }
      filePayload = fileJob.payloadJson;
      if (filePayload.status !== "READY" || filePayload.malwareStatus !== "CLEAN") {
        fail("FILE_NOT_READY", "File must be completed and clean before linking", 409, {
          status: filePayload.status,
          malwareStatus: filePayload.malwareStatus,
        });
      }
      if (filePayload.fundId && fundId && filePayload.fundId !== fundId) {
        fail("FILE_FUND_MISMATCH", "File upload belongs to another fund", 403);
      }
    } else if (data.contentBase64) {
      // Convenience path: create session + upload + complete inline
      const buffer = Buffer.from(data.contentBase64, "base64");
      const session = await this.createUploadSession(
        {
          fundId,
          fileName: `${sanitizeFileName(data.title)}.bin`,
          mimeType: "application/pdf",
          byteSize: buffer.byteLength,
          checksumSha256: sha256(buffer),
        },
        `${idempotencyKey}:session`,
        userId,
        user
      );
      await this.uploadFile(
        {
          fileId: session.fileId,
          contentBase64: data.contentBase64,
          checksumSha256: sha256(buffer),
        },
        userId,
        user
      );
      const completed = await this.completeFile(session.fileId, userId, user);
      const fileJob = await db.investmentJob.findUnique({ where: { id: completed.fileId } });
      filePayload = fileJob.payloadJson;
      data.fileId = completed.fileId;
    } else {
      fail("VALIDATION_ERROR", "fileId or contentBase64 is required");
    }

    const storageKey = filePayload.storageKey;
    const absolute = await assertUnderStorage(path.join(STORAGE_ROOT, storageKey));

    const document = await db.$transaction(async (tx: any) => {
      const doc = await tx.investmentDocument.create({
        data: {
          fundId: fundId || null,
          documentType: data.documentType,
          title: data.title,
          fileRef: absolute,
          currentVersionNo: 1,
          checksumSha256: filePayload.checksumSha256,
          classification: data.classification || "CONFIDENTIAL",
          orderId: data.orderId || null,
          tradeId: data.tradeId || null,
          approvalStatus: "PENDING_REVIEW",
          uploadedById: userId,
        },
      });
      await tx.investmentDocumentVersion.create({
        data: {
          documentId: doc.id,
          versionNo: 1,
          storageProvider: "LOCAL",
          storageKey,
          fileName: filePayload.fileName,
          mimeType: filePayload.mimeType,
          byteSize: BigInt(filePayload.byteSize),
          checksumSha256: filePayload.checksumSha256,
          malwareStatus: filePayload.malwareStatus,
          uploadedById: userId,
        },
      });
      await tx.investmentDocumentAcl.create({
        data: {
          documentId: doc.id,
          principalType: "USER",
          principalId: userId,
          permission: "ADMIN",
          grantedById: userId,
        },
      });
      if (data.orderId) {
        await tx.investmentDocumentLink.create({
          data: {
            documentId: doc.id,
            entityType: "ORDER",
            entityId: data.orderId,
            linkType: "ATTACHMENT",
            createdById: userId,
          },
        });
      }
      if (data.tradeId) {
        await tx.investmentDocumentLink.create({
          data: {
            documentId: doc.id,
            entityType: "TRADE",
            entityId: data.tradeId,
            linkType: "ATTACHMENT",
            createdById: userId,
          },
        });
      }
      return doc;
    });

    await InvestmentJobWorkerService.enqueue({
      jobType: "DOCUMENT_CREATE_IDEMPOTENCY",
      aggregateType: "Document",
      aggregateId: document.id,
      payloadJson: { documentId: document.id },
      idempotencyKey,
    });
    await db.investmentJob.updateMany({
      where: { idempotencyKey },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await InvestmentOpsAuditService.log(
      "DOCUMENT_CREATED",
      "Document",
      document.id,
      { fileId: data.fileId },
      userId
    );
    return this.get(document.id, userId, user);
  }

  /** Link an existing document (or create+link) to an order — used by POST /orders/:id/documents. */
  static async attachToOrder(
    orderId: string,
    data: any,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const order = await db.investmentOrder.findUnique({ where: { id: orderId }, select: { id: true, fundId: true } });
    if (!order) fail("ORDER_NOT_FOUND", "Order not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, order.fundId, user);

    if (data.documentId) {
      const doc = await documentAccess(data.documentId, userId, user, "WRITE");
      if (doc.fundId && doc.fundId !== order.fundId) {
        fail("DOCUMENT_FUND_MISMATCH", "Document belongs to another fund", 403);
      }
      const existing = await db.investmentDocumentLink.findFirst({
        where: { documentId: data.documentId, entityType: "ORDER", entityId: orderId },
      });
      if (existing) return { document: doc, link: existing };
      const link = await db.investmentDocumentLink.create({
        data: {
          documentId: data.documentId,
          entityType: "ORDER",
          entityId: orderId,
          linkType: data.linkType || "ATTACHMENT",
          createdById: userId,
        },
      });
      return { document: doc, link };
    }

    return this.createDocument(
      { ...data, orderId, fundId: data.fundId || order.fundId },
      idempotencyKey,
      userId,
      user
    );
  }

  /** Legacy upload — routes through secure path */
  static async upload(data: any, user: any) {
    if (data.fileRef && !data.contentBase64 && !data.fileId) {
      assertNoCallerFileRef(data.fileRef);
    }
    return this.createDocument(
      data,
      data.idempotencyKey || `legacy-doc:${randomUUID()}`,
      data.userId,
      user
    );
  }

  static async get(id: string, userId: string, user: any) {
    return documentAccess(id, userId, user, "READ");
  }

  static async patch(
    id: string,
    data: { title?: string; classification?: string; documentType?: string },
    userId: string,
    user: any
  ) {
    await documentAccess(id, userId, user, "WRITE");
    const updated = await db.investmentDocument.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.classification !== undefined ? { classification: data.classification } : {}),
        ...(data.documentType !== undefined ? { documentType: data.documentType } : {}),
        versionNo: { increment: 1 },
      },
    });
    await InvestmentOpsAuditService.log("DOCUMENT_UPDATED", "Document", id, data, userId);
    return updated;
  }

  static async listVersions(documentId: string, userId: string, user: any) {
    await documentAccess(documentId, userId, user, "READ");
    const versions = await db.investmentDocumentVersion.findMany({
      where: { documentId },
      orderBy: { versionNo: "desc" },
    });
    return versions.map((v: any) => ({ ...v, byteSize: String(v.byteSize) }));
  }

  static async addVersion(
    documentId: string,
    data: { fileId: string },
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const document = await documentAccess(documentId, userId, user, "WRITE");
    const fileJob = await db.investmentJob.findUnique({ where: { id: data.fileId } });
    if (!fileJob || fileJob.jobType !== "FILE_UPLOAD_SESSION") {
      fail("FILE_NOT_FOUND", "Completed file upload not found", 404);
    }
    const filePayload = fileJob.payloadJson as any;
    if (filePayload.status !== "READY" || filePayload.malwareStatus !== "CLEAN") {
      fail("FILE_NOT_READY", "File must be completed and clean", 409);
    }

    const existing = await db.investmentJob.findUnique({ where: { idempotencyKey } });
    if (existing?.payloadJson?.versionId) {
      return db.investmentDocumentVersion.findUnique({
        where: { id: existing.payloadJson.versionId },
      });
    }

    const versionNo = document.currentVersionNo + 1;
    const absolute = await assertUnderStorage(path.join(STORAGE_ROOT, filePayload.storageKey));
    const version = await db.$transaction(async (tx: any) => {
      const created = await tx.investmentDocumentVersion.create({
        data: {
          documentId,
          versionNo,
          storageProvider: "LOCAL",
          storageKey: filePayload.storageKey,
          fileName: filePayload.fileName,
          mimeType: filePayload.mimeType,
          byteSize: BigInt(filePayload.byteSize),
          checksumSha256: filePayload.checksumSha256,
          malwareStatus: filePayload.malwareStatus,
          uploadedById: userId,
        },
      });
      await tx.investmentDocument.update({
        where: { id: documentId },
        data: {
          currentVersionNo: versionNo,
          fileRef: absolute,
          checksumSha256: filePayload.checksumSha256,
          approvalStatus: "PENDING_REVIEW",
          versionNo: { increment: 1 },
        },
      });
      return created;
    });

    await InvestmentJobWorkerService.enqueue({
      jobType: "DOCUMENT_VERSION_IDEMPOTENCY",
      aggregateType: "DocumentVersion",
      aggregateId: version.id,
      payloadJson: { versionId: version.id },
      idempotencyKey,
    });
    await db.investmentJob.updateMany({
      where: { idempotencyKey },
      data: { status: "COMPLETED", completedAt: new Date() },
    });

    await InvestmentOpsAuditService.log(
      "DOCUMENT_VERSION_ADDED",
      "Document",
      documentId,
      { versionId: version.id, versionNo },
      userId
    );
    return { ...version, byteSize: String(version.byteSize) };
  }

  static async openVersionStream(
    documentId: string,
    versionId: string,
    userId: string,
    user: any,
    mode: "preview" | "download"
  ) {
    await documentAccess(documentId, userId, user, mode === "download" ? "DOWNLOAD" : "READ");
    const version = await db.investmentDocumentVersion.findFirst({
      where: { id: versionId, documentId },
    });
    if (!version) fail("VERSION_NOT_FOUND", "Document version not found", 404);
    if (version.malwareStatus !== "CLEAN") {
      fail("FILE_NOT_CLEAN", "File failed malware checks", 403, {
        malwareStatus: version.malwareStatus,
      });
    }
    const absolute = await assertUnderStorage(path.join(STORAGE_ROOT, version.storageKey));
    await InvestmentOpsAuditService.log(
      mode === "preview" ? "DOCUMENT_PREVIEWED" : "DOCUMENT_DOWNLOADED",
      "DocumentVersion",
      versionId,
      { documentId },
      userId
    );
    return {
      stream: createReadStream(absolute),
      contentType: version.mimeType,
      contentDisposition: contentDisposition(version.fileName, mode === "preview"),
      checksumSha256: version.checksumSha256,
      fileName: version.fileName,
    };
  }

  static async openDocumentDownload(
    documentId: string,
    userId: string,
    user: any,
    mode: "preview" | "download"
  ) {
    const doc = await documentAccess(
      documentId,
      userId,
      user,
      mode === "download" ? "DOWNLOAD" : "READ"
    );
    const version = doc.versions?.[0];
    if (version) {
      return this.openVersionStream(documentId, version.id, userId, user, mode);
    }
    if (!doc.fileRef) fail("FILE_NOT_FOUND", "Document has no downloadable file", 404);
    return this.openFileRefStream(doc, userId, mode);
  }

  static async openFileRefStream(doc: any, userId: string, mode: "preview" | "download") {
    const absolute = path.resolve(process.cwd(), String(doc.fileRef));
    if (
      !absolute.startsWith(STORAGE_ROOT + path.sep) &&
      absolute !== STORAGE_ROOT &&
      !absolute.startsWith(LOCAL_MOCK_ROOT + path.sep)
    ) {
      fail("UNSAFE_FILE_PATH", "File path is outside the controlled storage root", 400);
    }
    try {
      await access(absolute);
    } catch {
      await mkdir(path.dirname(absolute), { recursive: true });
      const placeholder = `%PDF-1.4\n% Demo document: ${doc.title || doc.id}\n`;
      await writeFile(absolute, placeholder, "utf8");
    }
    const fileName = path.basename(absolute);
    const mimeType = fileName.toLowerCase().endsWith(".pdf")
      ? "application/pdf"
      : fileName.toLowerCase().endsWith(".json")
        ? "application/json"
        : "application/octet-stream";
    await InvestmentOpsAuditService.log(
      mode === "preview" ? "DOCUMENT_PREVIEWED" : "DOCUMENT_DOWNLOADED",
      "Document",
      doc.id,
      { fileRef: doc.fileRef },
      userId
    );
    return {
      stream: createReadStream(absolute),
      contentType: mimeType,
      contentDisposition: contentDisposition(fileName, mode === "preview"),
      checksumSha256: doc.checksumSha256,
      fileName,
    };
  }

  static async versionDecision(
    documentId: string,
    versionId: string,
    decision: "APPROVE" | "REQUEST_CHANGES" | "REJECT",
    userId: string,
    user: any,
    reason?: string
  ) {
    await documentAccess(documentId, userId, user, "WRITE");
    const version = await db.investmentDocumentVersion.findFirst({
      where: { id: versionId, documentId },
    });
    if (!version) fail("VERSION_NOT_FOUND", "Document version not found", 404);

    const statusMap = {
      APPROVE: "APPROVED",
      REQUEST_CHANGES: "CHANGES_REQUESTED",
      REJECT: "REJECTED",
    } as const;
    const approvalStatus = statusMap[decision];
    const updated = await db.investmentDocument.update({
      where: { id: documentId },
      data: { approvalStatus, versionNo: { increment: 1 } },
    });
    await InvestmentOpsAuditService.log(
      `DOCUMENT_${decision}`,
      "DocumentVersion",
      versionId,
      { reason, approvalStatus },
      userId
    );
    return updated;
  }

  static async getAccess(documentId: string, userId: string, user: any) {
    const document = await documentAccess(documentId, userId, user, "READ");
    return document.aclEntries.filter((a: any) => !a.revokedAt);
  }

  static async putAccess(
    documentId: string,
    entries: Array<{ principalType: string; principalId: string; permission: string }>,
    userId: string,
    user: any
  ) {
    await documentAccess(documentId, userId, user, "ADMIN");
    if (!Array.isArray(entries)) fail("VALIDATION_ERROR", "entries array is required");

    await db.$transaction(async (tx: any) => {
      await tx.investmentDocumentAcl.updateMany({
        where: { documentId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      for (const entry of entries) {
        await tx.investmentDocumentAcl.create({
          data: {
            documentId,
            principalType: entry.principalType || "USER",
            principalId: entry.principalId,
            permission: entry.permission || "READ",
            grantedById: userId,
          },
        });
      }
    });
    await InvestmentOpsAuditService.log(
      "DOCUMENT_ACCESS_UPDATED",
      "Document",
      documentId,
      { entries },
      userId
    );
    return this.getAccess(documentId, userId, user);
  }

  static async audit(documentId: string, userId: string, user: any) {
    await documentAccess(documentId, userId, user, "READ");
    // Lightweight audit via AuditService entity filter is not available; return version + ACL timeline
    const [versions, acl] = await Promise.all([
      db.investmentDocumentVersion.findMany({
        where: { documentId },
        orderBy: { versionNo: "asc" },
      }),
      db.investmentDocumentAcl.findMany({
        where: { documentId },
        orderBy: { createdAt: "asc" },
      }),
    ]);
    return {
      documentId,
      versions: versions.map((v: any) => ({
        id: v.id,
        versionNo: v.versionNo,
        uploadedById: v.uploadedById,
        createdAt: v.createdAt,
        checksumSha256: v.checksumSha256,
        malwareStatus: v.malwareStatus,
      })),
      access: acl,
    };
  }

  static async archive(documentId: string, userId: string, user: any) {
    await documentAccess(documentId, userId, user, "ADMIN");
    const updated = await db.investmentDocument.update({
      where: { id: documentId },
      data: { isDeleted: true, versionNo: { increment: 1 } },
    });
    await InvestmentOpsAuditService.log("DOCUMENT_ARCHIVED", "Document", documentId, {}, userId);
    return updated;
  }
}
