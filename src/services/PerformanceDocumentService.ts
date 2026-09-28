
import { prisma } from "../utils/database";
import { remoteUploadService } from "./RemoteUploadService";

/**
 * Performance Document Vault. Company-wide performance document store — not scoped to a
 * performance contract, review or scorecard. Organised by a free-string `folder` (the vault's
 * folder bar) with a versioned lifecycle (`version` + `status`) and an optional retention date.
 *
 * Shape and CRUD mirror AccountingDocumentService / FundService.listFundDocuments; the upload
 * path goes through the same `remoteUploadService` pipeline every other document upload uses
 * (see PerformanceConfigService.uploadStrategyDocument and
 * FirebaseStorageService.uploadAccountingDocument).
 *
 * Backing table: `performance_documents` (scripts/run-performance-documents-migration.ts).
 */

/** Lifecycle states the vault UI exposes (Status column). */
export const PERFORMANCE_DOCUMENT_STATUSES = [
  "draft",
  "in_review",
  "approved",
  "archived",
] as const;

export type PerformanceDocumentStatus = (typeof PERFORMANCE_DOCUMENT_STATUSES)[number];

export const DEFAULT_PERFORMANCE_DOCUMENT_FOLDER = "General";
export const DEFAULT_PERFORMANCE_DOCUMENT_VERSION = "v1";
export const DEFAULT_PERFORMANCE_DOCUMENT_STATUS: PerformanceDocumentStatus = "draft";

/**
 * Remote upload type. `performance-documents` has no entry in RemoteUploadService's
 * UPLOAD_TYPE_MAP, and unmapped types silently fall through to the volatile `temp/` directory —
 * so vault files ride the durable `application-documents` folder, the same one
 * PerformanceConfigService uses for performance strategy PDFs. See the handoff doc if a
 * dedicated remote folder is wanted later.
 */
const PERFORMANCE_DOCUMENT_UPLOAD_TYPE = "application-documents";

const DOCUMENT_INCLUDE = {
  owner: { select: { id: true, firstName: true, lastName: true, email: true } },
  department: { select: { id: true, name: true } },
  uploadedBy: { select: { id: true, firstName: true, lastName: true, email: true } },
};

function trimmedOrUndefined(value: any): string | undefined {
  if (value === undefined || value === null) return undefined;
  const s = String(value).trim();
  return s === "" ? undefined : s;
}

/** Empty string / null means "clear this column"; undefined means "leave it alone". */
function nullableString(value: any): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

function normalizeStatus(value: any, fallback?: PerformanceDocumentStatus) {
  const raw = trimmedOrUndefined(value);
  if (raw === undefined) return fallback;
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (!PERFORMANCE_DOCUMENT_STATUSES.includes(normalized as PerformanceDocumentStatus)) {
    throw new Error(
      `status must be one of: ${PERFORMANCE_DOCUMENT_STATUSES.join(", ")}.`
    );
  }
  return normalized as PerformanceDocumentStatus;
}

function parseRetentionUntil(value: any): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === "") return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("retentionUntil must be a valid date.");
  }
  return parsed;
}

function sanitizeFileName(fileName: string): string {
  return String(fileName || "document").replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

async function assertUserExists(userId: string | null | undefined, field: string) {
  if (!userId) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) {
    throw new Error(`${field} must reference an existing user.`);
  }
}

async function assertDepartmentExists(departmentId: string | null | undefined) {
  if (!departmentId) return;
  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true },
  });
  if (!department) {
    throw new Error("departmentId must reference an existing department.");
  }
}

export class PerformanceDocumentService {
  /**
   * List vault documents, newest first. Every filter is optional and ANDed together.
   */
  static async listPerformanceDocuments(filters: {
    folder?: string;
    status?: string;
    ownerId?: string;
    departmentId?: string;
    category?: string;
    search?: string;
  } = {}, scope: any = {}) {
    const where: Record<string, any> = { ...scope };

    const folder = trimmedOrUndefined(filters.folder);
    if (folder) where.folder = folder;

    const status = normalizeStatus(filters.status);
    if (status) where.status = status;

    const ownerId = trimmedOrUndefined(filters.ownerId);
    if (ownerId) where.ownerId = ownerId;

    const departmentId = trimmedOrUndefined(filters.departmentId);
    if (departmentId) where.departmentId = departmentId;

    const category = trimmedOrUndefined(filters.category);
    if (category) where.category = category;

    const search = trimmedOrUndefined(filters.search);
    if (search) where.name = { contains: search };

    return prisma.performanceDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: DOCUMENT_INCLUDE,
    });
  }

  /**
   * Distinct folders with document counts — powers the vault's folder bar.
   * Returns real counts from `performance_documents`, not a hardcoded folder list.
   */
  static async listFolders() {
    const rows = await prisma.performanceDocument.groupBy({
      by: ["folder"],
      _count: { _all: true },
      orderBy: { folder: "asc" },
    });

    const folders = rows.map((row: any) => ({
      folder: row.folder,
      count: Number(row._count?._all ?? 0),
    }));

    return {
      folders,
      totalDocuments: folders.reduce((sum, row) => sum + row.count, 0),
    };
  }

  static async getPerformanceDocumentById(id: string) {
    const documentId = trimmedOrUndefined(id);
    if (!documentId) {
      throw new Error("Document id is required.");
    }
    const document = await prisma.performanceDocument.findUnique({
      where: { id: documentId },
      include: DOCUMENT_INCLUDE,
    });
    if (!document) {
      throw new Error("Performance document not found.");
    }
    return document;
  }

  /**
   * Push a file through the shared remote upload pipeline.
   * Returns the real relative media path (usable with `remoteUploadService.downloadFile`)
   * rather than a synthetic path string.
   */
  static async uploadPerformanceDocumentFile(params: {
    buffer: Buffer;
    fileName: string;
    mimeType?: string;
  }): Promise<{ filePath: string; downloadURL: string }> {
    const sanitizedName = sanitizeFileName(params.fileName);
    const remoteFileName = `${Date.now()}-${sanitizedName}`;
    try {
      const { filePath, downloadURL } = await remoteUploadService.uploadSingleFile(
        {
          buffer: params.buffer,
          originalname: remoteFileName,
          mimetype: params.mimeType || "application/octet-stream",
          size: params.buffer.length,
        },
        PERFORMANCE_DOCUMENT_UPLOAD_TYPE
      );
      return { filePath, downloadURL };
    } catch (error: any) {
      console.error("❌ Error uploading performance document:", error?.message);
      throw new Error(`Failed to upload performance document: ${error?.message}`);
    }
  }

  /**
   * Record a vault document after its file has been uploaded to storage.
   */
  static async createPerformanceDocument(params: {
    name: string;
    folder?: string;
    category?: string;
    version?: string;
    status?: string;
    fileUrl: string;
    storagePath?: string;
    mimeType?: string;
    fileSizeBytes?: number;
    ownerId?: string;
    departmentId?: string;
    retentionUntil?: string | Date | null;
    uploadedById?: string;
  }) {
    const name = trimmedOrUndefined(params.name);
    if (!name) {
      throw new Error("name is required.");
    }
    const fileUrl = trimmedOrUndefined(params.fileUrl);
    if (!fileUrl) {
      throw new Error("fileUrl is required.");
    }

    const ownerId = trimmedOrUndefined(params.ownerId) ?? null;
    const departmentId = trimmedOrUndefined(params.departmentId) ?? null;
    await assertUserExists(ownerId, "ownerId");
    await assertDepartmentExists(departmentId);

    return prisma.performanceDocument.create({
      data: {
        name,
        folder: trimmedOrUndefined(params.folder) ?? DEFAULT_PERFORMANCE_DOCUMENT_FOLDER,
        category: trimmedOrUndefined(params.category) ?? null,
        version: trimmedOrUndefined(params.version) ?? DEFAULT_PERFORMANCE_DOCUMENT_VERSION,
        status: normalizeStatus(params.status, DEFAULT_PERFORMANCE_DOCUMENT_STATUS),
        fileUrl,
        storagePath: trimmedOrUndefined(params.storagePath) ?? null,
        mimeType: trimmedOrUndefined(params.mimeType) ?? null,
        fileSizeBytes:
          params.fileSizeBytes === undefined || params.fileSizeBytes === null
            ? null
            : Number(params.fileSizeBytes),
        ownerId,
        departmentId,
        retentionUntil: parseRetentionUntil(params.retentionUntil) ?? null,
        uploadedById: trimmedOrUndefined(params.uploadedById) ?? null,
      },
      include: DOCUMENT_INCLUDE,
    });
  }

  /**
   * Upload a file and record it in one step (POST /api/performance/documents).
   */
  static async uploadPerformanceDocument(params: {
    fileBuffer: Buffer;
    fileName: string;
    mimeType?: string;
    fileSizeBytes?: number;
    name?: string;
    folder?: string;
    category?: string;
    version?: string;
    status?: string;
    ownerId?: string;
    departmentId?: string;
    retentionUntil?: string | Date | null;
    uploadedById?: string;
  }) {
    if (!params.fileBuffer || params.fileBuffer.length === 0) {
      throw new Error("No file uploaded.");
    }

    // Validate references and status before spending an upload round-trip.
    const ownerId = trimmedOrUndefined(params.ownerId) ?? null;
    const departmentId = trimmedOrUndefined(params.departmentId) ?? null;
    normalizeStatus(params.status, DEFAULT_PERFORMANCE_DOCUMENT_STATUS);
    parseRetentionUntil(params.retentionUntil);
    await assertUserExists(ownerId, "ownerId");
    await assertDepartmentExists(departmentId);

    const { filePath, downloadURL } = await this.uploadPerformanceDocumentFile({
      buffer: params.fileBuffer,
      fileName: params.fileName,
      mimeType: params.mimeType,
    });

    return this.createPerformanceDocument({
      name: trimmedOrUndefined(params.name) ?? params.fileName,
      folder: params.folder,
      category: params.category,
      version: params.version,
      status: params.status,
      fileUrl: downloadURL,
      storagePath: filePath,
      mimeType: params.mimeType,
      fileSizeBytes: params.fileSizeBytes ?? params.fileBuffer.length,
      ownerId: ownerId ?? undefined,
      departmentId: departmentId ?? undefined,
      retentionUntil: params.retentionUntil,
      uploadedById: params.uploadedById,
    });
  }

  /**
   * Patch vault metadata. Only supplied keys are touched; `null`/`""` clears a nullable column.
   * The stored file itself is immutable here — re-upload for a new version.
   */
  static async updatePerformanceDocument(
    id: string,
    patch: {
      name?: string;
      folder?: string;
      category?: string | null;
      version?: string;
      status?: string;
      ownerId?: string | null;
      departmentId?: string | null;
      retentionUntil?: string | Date | null;
    }
  ) {
    const existing = await this.getPerformanceDocumentById(id);

    const data: Record<string, any> = {};

    const name = trimmedOrUndefined(patch.name);
    if (name !== undefined) data.name = name;

    const folder = trimmedOrUndefined(patch.folder);
    if (folder !== undefined) data.folder = folder;

    const category = nullableString(patch.category);
    if (category !== undefined) data.category = category;

    const version = trimmedOrUndefined(patch.version);
    if (version !== undefined) data.version = version;

    if (patch.status !== undefined) {
      data.status = normalizeStatus(patch.status, DEFAULT_PERFORMANCE_DOCUMENT_STATUS);
    }

    const ownerId = nullableString(patch.ownerId);
    if (ownerId !== undefined) {
      await assertUserExists(ownerId, "ownerId");
      data.ownerId = ownerId;
    }

    const departmentId = nullableString(patch.departmentId);
    if (departmentId !== undefined) {
      await assertDepartmentExists(departmentId);
      data.departmentId = departmentId;
    }

    const retentionUntil = parseRetentionUntil(patch.retentionUntil);
    if (retentionUntil !== undefined) data.retentionUntil = retentionUntil;

    if (Object.keys(data).length === 0) {
      return existing;
    }

    return prisma.performanceDocument.update({
      where: { id: existing.id },
      data,
      include: DOCUMENT_INCLUDE,
    });
  }

  /**
   * Delete the vault record. The uploaded blob is deliberately left on the media server:
   * `remoteUploadService.deleteFile` is still an unimplemented placeholder that throws, so calling
   * it here would turn every delete into a 500. Same behaviour as every other document domain.
   */
  static async deletePerformanceDocument(id: string) {
    const existing = await this.getPerformanceDocumentById(id);
    await prisma.performanceDocument.delete({ where: { id: existing.id } });
    return { id: existing.id, deleted: true };
  }
}

export default PerformanceDocumentService;
