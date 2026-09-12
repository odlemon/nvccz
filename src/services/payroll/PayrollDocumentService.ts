// @ts-nocheck
/**
 * Payroll Document Vault — the store behind /payroll/vault.
 *
 * The Vault screen rendered a register of control packs, statutory returns and an
 * employment contract that nobody had uploaded: string literals in the vendored runtime
 * (FINDING-017). Its Upload control pushed another invented record — owner "Tariro Moyo",
 * modified "Just now" — onto an in-memory array. Nothing was ever stored.
 *
 * Downloads never hand the browser a storage URL. Files land in the media store served
 * at /api/public-media, which requires no authentication; a payroll bank file at a public
 * URL is the wrong default for this module. So the register omits fileUrl and storagePath,
 * and bytes are fetched server-side behind payroll.vault.view. The public-media route
 * itself is a platform-wide exposure this change does not fix — the accounting vault
 * stores its files the same way — and is flagged rather than silently relied on.
 *
 * `classification` is a label. Access to every document is governed by
 * payroll.vault.view / payroll.vault.manage, not by the label; nothing here pretends
 * otherwise.
 */
import { prisma } from "../../utils/database"
import { remoteUploadService } from "../RemoteUploadService"

export const PAYROLL_DOCUMENT_CLASSIFICATIONS = [
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
  "HIGHLY_RESTRICTED",
]

/** The categories the upload form offers and the register groups by. */
export const PAYROLL_DOCUMENT_CATEGORIES = [
  "Payroll control packs",
  "Statutory returns",
  "Employee records",
  "Policies and procedures",
  "Bank and payment files",
  "Training and compliance",
  "Access reviews",
]

export const PAYROLL_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024

function bad(message: string, status = 400) {
  return Object.assign(new Error(message), { status })
}

function normaliseClassification(value: unknown): string {
  const c = String(value ?? "INTERNAL").trim().toUpperCase().split(" ").join("_")
  if (!PAYROLL_DOCUMENT_CLASSIFICATIONS.includes(c)) {
    throw bad(`classification must be one of: ${PAYROLL_DOCUMENT_CLASSIFICATIONS.join(", ")}`)
  }
  return c
}

function shape(d: any) {
  return {
    id: d.id,
    reference: d.reference ?? null,
    name: d.name,
    category: d.category,
    classification: d.classification,
    periodLabel: d.periodLabel ?? null,
    payrollRun: d.payrollRun
      ? { id: d.payrollRun.id, name: d.payrollRun.name, payPeriod: d.payrollRun.payPeriod }
      : null,
    mimeType: d.mimeType ?? null,
    fileSizeBytes: d.fileSizeBytes ?? null,
    uploadedBy: d.uploadedBy
      ? {
          id: d.uploadedBy.id,
          name: `${d.uploadedBy.firstName ?? ""} ${d.uploadedBy.lastName ?? ""}`.trim() || null,
        }
      : null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  }
}

const LIST_SELECT = {
  id: true,
  reference: true,
  name: true,
  category: true,
  classification: true,
  periodLabel: true,
  mimeType: true,
  fileSizeBytes: true,
  createdAt: true,
  updatedAt: true,
  uploadedBy: { select: { id: true, firstName: true, lastName: true } },
  payrollRun: { select: { id: true, name: true, payPeriod: true } },
}

export class PayrollDocumentService {
  static async list() {
    const rows = await prisma.payrollDocument.findMany({
      orderBy: { createdAt: "desc" },
      select: LIST_SELECT,
    })
    // A category already in use stays listed even if it is later dropped from the
    // catalogue, so no stored document disappears from the folder view.
    const categories = Array.from(
      new Set([...PAYROLL_DOCUMENT_CATEGORIES, ...rows.map((r: any) => r.category)]),
    )
    return {
      items: rows.map(shape),
      categories,
      classifications: PAYROLL_DOCUMENT_CLASSIFICATIONS,
      total: rows.length,
    }
  }

  static async create(params: {
    file?: { buffer: Buffer; originalname: string; mimetype?: string; size?: number } | null
    category?: unknown
    classification?: unknown
    periodLabel?: unknown
    payrollRunId?: unknown
    uploadedById?: string | null
  }) {
    const file = params.file
    if (!file || !file.buffer || !file.originalname) throw bad("Choose a file to upload")
    const size = Number(file.size ?? file.buffer.length)
    if (size <= 0) throw bad("The file is empty")
    if (size > PAYROLL_DOCUMENT_MAX_BYTES) throw bad("Documents must be 20MB or less")

    const category = String(params.category ?? "").trim()
    if (!PAYROLL_DOCUMENT_CATEGORIES.includes(category)) {
      throw bad(`category must be one of: ${PAYROLL_DOCUMENT_CATEGORIES.join(", ")}`)
    }
    const classification = normaliseClassification(params.classification)

    const periodLabel = params.periodLabel == null ? "" : String(params.periodLabel).trim()
    if (periodLabel.length > 64) throw bad("periodLabel must be 64 characters or fewer")

    const payrollRunId = params.payrollRunId == null ? "" : String(params.payrollRunId).trim()
    if (payrollRunId) {
      const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId }, select: { id: true } })
      if (!run) throw bad("Payroll run not found", 404)
    }

    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")
    const uploaded = await remoteUploadService.uploadSingleFile(
      {
        buffer: file.buffer,
        originalname: `${Date.now()}-${safeName}`,
        mimetype: file.mimetype || "application/octet-stream",
      },
      "payroll-documents",
    )

    const created = await prisma.payrollDocument.create({
      data: {
        name: file.originalname,
        category,
        classification,
        reference: `PDOC-${Date.now().toString(36).toUpperCase()}`,
        periodLabel: periodLabel || null,
        payrollRunId: payrollRunId || null,
        fileUrl: uploaded.downloadURL,
        storagePath: uploaded.filePath,
        mimeType: file.mimetype || null,
        fileSizeBytes: size,
        uploadedById: params.uploadedById ?? null,
      },
      select: LIST_SELECT,
    })
    return shape(created)
  }

  /**
   * The stored bytes for one document. Throws 404 with `doc` attached when the record
   * exists but its file does not, so the caller can audit the failed attempt too.
   */
  static async fetchFile(id: string) {
    const doc = await prisma.payrollDocument.findUnique({
      where: { id: String(id) },
      select: {
        id: true,
        name: true,
        classification: true,
        mimeType: true,
        storagePath: true,
        fileUrl: true,
      },
    })
    if (!doc) throw bad("Document not found", 404)
    try {
      const buffer = await remoteUploadService.downloadFile(doc.storagePath || doc.fileUrl)
      return { doc, buffer }
    } catch {
      throw Object.assign(bad("The file for this document is missing from storage.", 404), {
        code: "DOCUMENT_FILE_MISSING",
        doc,
      })
    }
  }
}
