// @ts-nocheck
import crypto from "node:crypto";
import mammoth from "mammoth";
import * as XLSX from "xlsx";
import { prisma } from "../utils/database";
import { remoteUploadService } from "./RemoteUploadService";
import AuditService from "./AuditService";

/**
 * SRD §32: the procurement document vault.
 *
 * - Central storage of PDF, DOCX, XLSX, XLS, CSV, JPG, JPEG and PNG. A file is accepted on its extension AND its content
 *   (a renamed executable is refused), and stored with its checksum.
 * - Every stored file is a version: a new version adds a row to procurement_document_versions and the earlier ones stay
 *   retrievable. The document row always describes the latest.
 * - Uploader, upload date and the related transaction are captured by the server, not typed in. The related transaction is
 *   resolved to a real record (PO, RFQ, invoice ...) and refused when it does not exist.
 * - Preview: a PDF or image is served inline; a DOCX, spreadsheet or CSV is converted to safe HTML on the server, so it can
 *   be read in the browser without downloading.
 * - Opening or downloading a stored file is audited (File download), a stored file or version is audited (File upload).
 */
export class DocumentError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const bad = (m: string) => new DocumentError(400, m);
const notFound = (what: string) => new DocumentError(404, `${what} not found`);

export const MAX_DOCUMENT_BYTES = 100 * 1024 * 1024;
export const DOCUMENT_STATUSES = ["under_review", "approved", "archived"] as const;
const DOCUMENT_UPLOAD_TYPE = "application-documents";

type Kind = "pdf" | "image" | "docx" | "sheet" | "csv";
export const DOCUMENT_FORMATS: Record<string, { mime: string; kind: Kind }> = {
  pdf: { mime: "application/pdf", kind: "pdf" },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", kind: "docx" },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", kind: "sheet" },
  xls: { mime: "application/vnd.ms-excel", kind: "sheet" },
  csv: { mime: "text/csv", kind: "csv" },
  jpg: { mime: "image/jpeg", kind: "image" },
  jpeg: { mime: "image/jpeg", kind: "image" },
  png: { mime: "image/png", kind: "image" },
};
export const SUPPORTED_EXTENSIONS = Object.keys(DOCUMENT_FORMATS);

const str = (v: any): string | undefined => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
};

const extensionOf = (name: string) => String(name || "").match(/\.([A-Za-z0-9]{1,6})$/)?.[1]?.toLowerCase() ?? "";

/** The format of an uploaded file, from its extension and its first bytes; throws with a plain message when it is not one of the eight. */
export function inspectFile(file: { buffer: Buffer; originalname: string }) {
  const name = String(file?.originalname || "");
  const ext = extensionOf(name);
  const format = DOCUMENT_FORMATS[ext];
  if (!format) {
    throw bad(`${name || "That file"} is not a supported format. Upload a ${SUPPORTED_EXTENSIONS.map((e) => e.toUpperCase()).join(", ")} file.`);
  }
  const b: Buffer = file.buffer;
  if (!b?.length) throw bad(`${name} is empty`);
  if (b.length > MAX_DOCUMENT_BYTES) throw bad(`${name} is larger than the ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB limit`);
  const head = b.subarray(0, 8).toString("hex");
  const asText = b.subarray(0, 2048).toString("latin1");
  let ok = false;
  switch (ext) {
    case "pdf": ok = b.subarray(0, 1024).toString("latin1").includes("%PDF-"); break;
    case "png": ok = head.startsWith("89504e47"); break;
    case "jpg":
    case "jpeg": ok = head.startsWith("ffd8ff"); break;
    case "xls": ok = head.startsWith("d0cf11e0a1b11ae1"); break;
    case "docx": ok = head.startsWith("504b0304") && b.includes("word/"); break;
    case "xlsx": ok = head.startsWith("504b0304") && b.includes("xl/"); break;
    case "csv": ok = !b.subarray(0, 8192).includes(0); break;
  }
  if (!ok) throw bad(`${name} does not look like a real ${ext.toUpperCase()} file (its content does not match its name). Check the file and try again.`);
  void asText;
  return { ext, mime: format.mime, kind: format.kind, checksum: crypto.createHash("sha256").update(b).digest("hex") };
}

// ---------------------------------------------------------------------------- related transaction

type Related = { type: string; id: string; number: string; label: string; route: string };
const ROUTES: Record<string, string> = {
  PURCHASE_REQUISITION: "/procurement/requisitions",
  RFQ: "/procurement/tenders",
  QUOTATION: "/procurement/quotations",
  PURCHASE_ORDER: "/procurement/purchase-orders",
  GRN: "/procurement/goods-received",
  INVOICE: "/procurement/invoices",
  CONTRACT: "/procurement/contracts",
  PLAN: "/procurement/plan",
  VENDOR: "/procurement/vendors",
};

/** The record a reference (its number, or a vendor's name) points to, or null when there is none. */
export async function resolveRelated(reference: string): Promise<Related | null> {
  const ref = str(reference);
  if (!ref) return null;
  const finders: Array<() => Promise<Related | null>> = [
    async () => { const r = await prisma.purchaseRequisition.findFirst({ where: { requisitionNumber: ref }, select: { id: true, requisitionNumber: true, title: true } }); return r && { type: "PURCHASE_REQUISITION", id: r.id, number: r.requisitionNumber, label: `${r.requisitionNumber} · ${r.title}`, route: ROUTES.PURCHASE_REQUISITION }; },
    async () => { const r = await prisma.procurementRfq.findFirst({ where: { rfqNumber: ref }, select: { id: true, rfqNumber: true, title: true } }); return r && { type: "RFQ", id: r.id, number: r.rfqNumber, label: `${r.rfqNumber} · ${r.title}`, route: ROUTES.RFQ }; },
    async () => { const r = await prisma.vendorQuotation.findFirst({ where: { quotationNumber: ref }, select: { id: true, quotationNumber: true, companyName: true } }); return r && { type: "QUOTATION", id: r.id, number: r.quotationNumber, label: `${r.quotationNumber}${r.companyName ? ` · ${r.companyName}` : ""}`, route: ROUTES.QUOTATION }; },
    async () => { const r = await prisma.purchaseOrder.findFirst({ where: { poNumber: ref }, select: { id: true, poNumber: true } }); return r && { type: "PURCHASE_ORDER", id: r.id, number: r.poNumber, label: r.poNumber, route: ROUTES.PURCHASE_ORDER }; },
    async () => { const r = await prisma.goodsReceivedNote.findFirst({ where: { grnNumber: ref }, select: { id: true, grnNumber: true } }); return r && { type: "GRN", id: r.id, number: r.grnNumber, label: r.grnNumber, route: ROUTES.GRN }; },
    async () => { const r = await prisma.procurementInvoice.findFirst({ where: { invoiceNumber: ref }, select: { id: true, invoiceNumber: true } }); return r && { type: "INVOICE", id: r.id, number: r.invoiceNumber, label: r.invoiceNumber, route: ROUTES.INVOICE }; },
    async () => { const r = await prisma.procurementContract.findFirst({ where: { contractNumber: ref }, select: { id: true, contractNumber: true, title: true } }); return r && { type: "CONTRACT", id: r.id, number: r.contractNumber, label: `${r.contractNumber} · ${r.title}`, route: ROUTES.CONTRACT }; },
    async () => { const r = await prisma.procurementPlan.findFirst({ where: { planNumber: ref }, select: { id: true, planNumber: true, name: true } }); return r && { type: "PLAN", id: r.id, number: r.planNumber, label: `${r.planNumber} · ${r.name}`, route: ROUTES.PLAN }; },
    async () => { const r = await prisma.vendor.findFirst({ where: { OR: [{ name: ref }, { bpNumber: ref }] }, select: { id: true, name: true, bpNumber: true } }); return r && { type: "VENDOR", id: r.id, number: r.bpNumber || r.name, label: r.name, route: ROUTES.VENDOR }; },
  ];
  for (const f of finders) {
    const hit = await f();
    if (hit) return hit;
  }
  return null;
}

/** The link a document carries to its record, from what was stored at upload: no lookup per document, so a long list stays fast. */
function relatedLinkOf(doc: any): Related | null {
  if (!doc.relatedRecordType || !doc.relatedRecordId) return null;
  return { type: doc.relatedRecordType, id: doc.relatedRecordId, number: doc.relatedRecord ?? "", label: doc.relatedRecord ?? doc.relatedRecordId, route: ROUTES[doc.relatedRecordType] ?? "/procurement" };
}

// ---------------------------------------------------------------------------- helpers

async function storeFile(file: { buffer: Buffer; originalname: string; mimetype?: string; size?: number }, mime: string) {
  const safe = String(file.originalname || "document").replace(/[^a-zA-Z0-9.\-_]/g, "_");
  try {
    return await remoteUploadService.uploadSingleFile(
      { buffer: file.buffer, originalname: `${Date.now()}-${safe}`, mimetype: mime, size: file.size ?? file.buffer.length },
      DOCUMENT_UPLOAD_TYPE,
    );
  } catch (err: any) {
    throw new DocumentError(502, `The file could not be stored: ${err?.message || err}`);
  }
}

const label = (n: number) => `v${n}.0`;

async function usersByIds(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter(Boolean))] as string[];
  const users = unique.length ? await prisma.user.findMany({ where: { id: { in: unique } }, select: { id: true, firstName: true, lastName: true, email: true } }) : [];
  return new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email]));
}

const sizeOf = (v: any) => (v == null ? null : Number(v));

async function decorate(rows: any[]) {
  const names = await usersByIds(rows.map((r) => r.uploadedById));
  const out = [];
  for (const r of rows) {
    out.push({
      ...r,
      fileSizeBytes: sizeOf(r.fileSizeBytes),
      uploadedByName: names.get(r.uploadedById) ?? null,
      relatedLink: relatedLinkOf(r),
      previewKind: DOCUMENT_FORMATS[r.extension || extensionOf(r.name)]?.kind ?? null,
    });
  }
  return out;
}

async function audit(userId: string | undefined, action: string, id: string, oldValues: any, newValues: any) {
  try {
    await AuditService.log({ userId, action, entityType: "ProcurementDocument", entityId: id, oldValues, newValues });
  } catch (err) {
    console.error(`audit ProcurementDocument ${action}:`, (err as Error)?.message || err);
  }
}

// ---------------------------------------------------------------------------- the service

export const ProcurementDocuments = {
  async list(filters: { folder?: string; status?: string; search?: string; type?: string; related?: string } = {}) {
    const where: any = {};
    const folder = str(filters.folder);
    if (folder) where.folder = folder;
    const status = str(filters.status);
    where.status = status ? status : { not: "archived" };
    const search = str(filters.search);
    if (search) where.OR = [{ name: { contains: search } }, { relatedRecord: { contains: search } }, { documentType: { contains: search } }];
    const ext = str(filters.type)?.toLowerCase();
    if (ext) where.extension = ext;
    const related = str(filters.related);
    if (related) where.relatedRecord = related;
    const rows = await prisma.procurementDocument.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
    return decorate(rows);
  },

  async get(id: string) {
    const doc = await prisma.procurementDocument.findUnique({ where: { id }, include: { versions: { orderBy: { versionNo: "desc" } } } });
    if (!doc) throw notFound("Document");
    const [decorated] = await decorate([doc]);
    const names = await usersByIds(doc.versions.map((v) => v.uploadedById));
    return {
      ...decorated,
      versions: doc.versions.map((v) => ({
        id: v.id,
        versionNo: v.versionNo,
        versionLabel: v.versionLabel,
        originalName: v.originalName,
        mimeType: v.mimeType,
        fileSizeBytes: sizeOf(v.fileSizeBytes),
        checksum: v.checksum,
        changeNote: v.changeNote,
        uploadedById: v.uploadedById,
        uploadedByName: names.get(v.uploadedById) ?? null,
        uploadedAt: v.uploadedAt,
        isCurrent: v.versionNo === doc.currentVersionNo,
      })),
    };
  },

  /** Store one or more files. Every file is checked before any is stored, so a bad file in a batch stores nothing. */
  async upload(params: {
    files: Array<{ buffer: Buffer; originalname: string; mimetype?: string; size?: number }>;
    name?: string;
    folder?: string;
    documentType?: string;
    relatedRecord?: string;
    relatedRecordType?: string;
    relatedRecordId?: string;
    classification?: string;
    source?: string;
    description?: string;
    uploadedById: string;
  }) {
    if (!params.files?.length) throw bad("Attach at least one file");
    const inspected = params.files.map((f) => ({ file: f, info: inspectFile(f) }));

    let related: Related | null = null;
    const ref = str(params.relatedRecord);
    if (ref) {
      related = await resolveRelated(ref);
      if (!related) throw bad(`No record numbered "${ref}" was found. Choose the purchase order, RFQ, invoice, contract, plan or vendor this document belongs to.`);
    } else if (str(params.relatedRecordId)) {
      throw bad("Say which record the document belongs to by its number.");
    }

    const created = [];
    for (const [idx, { file, info }] of inspected.entries()) {
      const { filePath, downloadURL } = await storeFile(file, info.mime);
      const base = str(params.name);
      const name = (base ? (params.files.length > 1 ? `${base} (${idx + 1})` : base) : file.originalname).slice(0, 255);
      const doc = await prisma.procurementDocument.create({
        data: {
          name,
          folder: str(params.folder) ?? "General",
          documentType: str(params.documentType) ?? null,
          relatedRecord: related?.number ?? null,
          relatedRecordType: related?.type ?? null,
          relatedRecordId: related?.id ?? null,
          classification: str(params.classification) ?? "Internal",
          source: str(params.source) ?? "Internal upload",
          description: str(params.description) ?? null,
          fileUrl: downloadURL,
          storagePath: filePath,
          mimeType: info.mime,
          fileSizeBytes: file.size ?? file.buffer.length,
          originalName: file.originalname.slice(0, 255),
          extension: info.ext,
          checksum: info.checksum,
          currentVersionNo: 1,
          version: label(1),
          uploadedById: params.uploadedById,
          versions: {
            create: {
              versionNo: 1,
              versionLabel: label(1),
              originalName: file.originalname.slice(0, 255),
              fileUrl: downloadURL,
              storagePath: filePath,
              mimeType: info.mime,
              fileSizeBytes: file.size ?? file.buffer.length,
              checksum: info.checksum,
              uploadedById: params.uploadedById,
            },
          },
        },
      });
      await audit(params.uploadedById, "DOCUMENT_UPLOAD", doc.id, undefined, {
        name: doc.name, folder: doc.folder, version: doc.version, format: info.ext, sizeBytes: doc.fileSizeBytes, checksum: info.checksum, relatedRecord: doc.relatedRecord,
      });
      created.push(doc);
    }
    return decorate(created);
  },

  /** A new version of a stored document: the earlier versions stay, the new one becomes current and goes back to review. */
  async uploadVersion(id: string, file: any, userId: string, note?: string) {
    const existing = await prisma.procurementDocument.findUnique({ where: { id } });
    if (!existing) throw notFound("Document");
    if (!file?.buffer?.length) throw bad("Attach the new version's file");
    const info = inspectFile(file);
    if (existing.checksum && existing.checksum === info.checksum) throw bad("That file is identical to the current version. Attach the revised file.");
    const { filePath, downloadURL } = await storeFile(file, info.mime);
    const versionNo = (existing.currentVersionNo || 1) + 1;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.procurementDocumentVersion.create({
        data: {
          documentId: id, versionNo, versionLabel: label(versionNo), originalName: String(file.originalname).slice(0, 255), fileUrl: downloadURL, storagePath: filePath,
          mimeType: info.mime, fileSizeBytes: file.size ?? file.buffer.length, checksum: info.checksum, changeNote: str(note) ?? null, uploadedById: userId,
        },
      });
      return tx.procurementDocument.update({
        where: { id },
        data: {
          version: label(versionNo), currentVersionNo: versionNo, status: "under_review", fileUrl: downloadURL, storagePath: filePath, mimeType: info.mime,
          fileSizeBytes: file.size ?? file.buffer.length, originalName: String(file.originalname).slice(0, 255), extension: info.ext, checksum: info.checksum,
        },
      });
    });
    await audit(userId, "DOCUMENT_VERSION_UPLOAD", id,
      { version: existing.version, status: existing.status, format: existing.extension, checksum: existing.checksum },
      { version: updated.version, status: updated.status, format: info.ext, checksum: info.checksum, sizeBytes: updated.fileSizeBytes, note: str(note) ?? null });
    const [out] = await decorate([updated]);
    return out;
  },

  async setStatus(id: string, status: string, userId: string) {
    const s = str(status)?.toLowerCase();
    if (!s || !DOCUMENT_STATUSES.includes(s as any)) throw bad(`status must be one of: ${DOCUMENT_STATUSES.join(", ")}`);
    const existing = await prisma.procurementDocument.findUnique({ where: { id } });
    if (!existing) throw notFound("Document");
    const updated = await prisma.procurementDocument.update({ where: { id }, data: { status: s } });
    await audit(userId, s === "approved" ? "APPROVE" : s === "archived" ? "CLOSE" : "UPDATE", id, { status: existing.status }, { status: s });
    return updated;
  },

  /** The bytes of a stored file (the current version, or a named earlier one). Audited as a file download. */
  async file(id: string, opts: { version?: number; disposition?: "inline" | "attachment"; userId?: string; audit?: boolean }) {
    const doc = await prisma.procurementDocument.findUnique({ where: { id }, include: { versions: true } });
    if (!doc) throw notFound("Document");
    const ver = opts.version ? doc.versions.find((v) => v.versionNo === Number(opts.version)) : doc.versions.find((v) => v.versionNo === doc.currentVersionNo);
    if (opts.version && !ver) throw notFound(`Version ${opts.version}`);
    const source = ver ?? doc;
    const location = source.storagePath || source.fileUrl;
    if (!location) throw new DocumentError(404, "This document has no stored file.");
    let buffer: Buffer;
    try {
      buffer = await remoteUploadService.downloadFile(location);
    } catch (err: any) {
      throw new DocumentError(502, `The stored file could not be read: ${err?.message || err}`);
    }
    const filename = (ver?.originalName || doc.originalName || doc.name || "document").replace(/[\r\n"]/g, "");
    const mime = ver?.mimeType || doc.mimeType || DOCUMENT_FORMATS[extensionOf(filename)]?.mime || "application/octet-stream";
    if (opts.audit !== false) {
      await audit(opts.userId, opts.disposition === "attachment" ? "DOCUMENT_DOWNLOAD" : "DOCUMENT_PREVIEW", id, undefined, {
        name: doc.name, version: ver?.versionLabel ?? doc.version, format: extensionOf(filename), sizeBytes: buffer.length, disposition: opts.disposition ?? "inline",
      });
    }
    return { buffer, mime, filename, kind: DOCUMENT_FORMATS[extensionOf(filename)]?.kind ?? null };
  },

  /**
   * What the browser needs to show a document without downloading it. A PDF or image is shown from its own bytes (kind
   * "pdf" / "image", the client asks for the file inline); a DOCX, spreadsheet or CSV is converted here to HTML, which the
   * client shows in a sandboxed frame.
   */
  async preview(id: string, opts: { version?: number; userId?: string }) {
    const doc = await prisma.procurementDocument.findUnique({ where: { id }, include: { versions: true } });
    if (!doc) throw notFound("Document");
    const ver = opts.version ? doc.versions.find((v) => v.versionNo === Number(opts.version)) : doc.versions.find((v) => v.versionNo === doc.currentVersionNo);
    const filename = ver?.originalName || doc.originalName || doc.name;
    const kind = DOCUMENT_FORMATS[extensionOf(filename)]?.kind ?? DOCUMENT_FORMATS[doc.extension || ""]?.kind ?? null;
    const base = { id, name: doc.name, filename, version: ver?.versionLabel ?? doc.version, versionNo: ver?.versionNo ?? doc.currentVersionNo, kind, mime: ver?.mimeType || doc.mimeType };
    if (!kind) return { ...base, kind: "unsupported", message: "This file type cannot be shown in the browser. Download it to open it." };
    if (kind === "pdf" || kind === "image") return base;

    const { buffer } = await this.file(id, { version: opts.version, disposition: "inline", userId: opts.userId });
    if (buffer.length > 30 * 1024 * 1024) return { ...base, kind: "unsupported", message: "This file is too large to convert for preview. Download it to open it." };
    try {
      if (kind === "docx") {
        const out = await mammoth.convertToHtml({ buffer });
        return { ...base, html: wrapHtml(out.value || "<p>This document has no readable text.</p>") };
      }
      const wb = XLSX.read(buffer, { type: "buffer", sheetRows: 501, raw: kind === "csv" });
      const names = wb.SheetNames.slice(0, 10);
      const parts = names.map((n) => `<section><h2>${escapeHtml(n)}</h2>${XLSX.utils.sheet_to_html(wb.Sheets[n], { header: "", footer: "" })}</section>`);
      const truncated = names.some((n) => (wb.Sheets[n]["!ref"] ? XLSX.utils.decode_range(wb.Sheets[n]["!ref"]).e.r >= 500 : false));
      return { ...base, html: wrapHtml(parts.join("") + (truncated ? "<p class=note>Showing the first 500 rows of each sheet. Download the file for the rest.</p>" : "")) };
    } catch (err: any) {
      return { ...base, kind: "unsupported", message: `This file could not be converted for preview (${String(err?.message || err).slice(0, 120)}). Download it to open it.` };
    }
  },
};

const escapeHtml = (s: string) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Scripts and event handlers never reach the page; the client also shows this in a frame that runs no scripts. */
function wrapHtml(body: string) {
  const safe = body.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*')/gi, "");
  return `<!doctype html><meta charset="utf-8"><style>body{font:14px/1.5 system-ui,Segoe UI,Arial,sans-serif;color:#1c1c28;margin:16px;background:#fff}table{border-collapse:collapse;margin:8px 0}td,th{border:1px solid #d4d4dc;padding:4px 8px;vertical-align:top}h2{font-size:15px;margin:18px 0 6px}img{max-width:100%}.note{color:#6b6b7b}</style>${safe}`;
}
