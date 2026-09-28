// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import { PerformanceDocumentService } from "./PerformanceDocumentService";
import { remoteUploadService } from "./RemoteUploadService";

export const VAULT_FOLDERS = ["Strategy", "Performance Contracts", "Reviews", "KPI Evidence", "Corrective Actions", "Performance Reports", "Compliance Reports", "Templates"];
export const RETENTION_CLASSES: Record<string, { label: string; years: number | null }> = {
  "3_years": { label: "3 years", years: 3 },
  "7_years": { label: "7 years", years: 7 },
  "10_years": { label: "10 years", years: 10 },
  employment_7: { label: "Employment + 7 years", years: null },
  permanent: { label: "Permanent", years: null }
};
export const AUDIENCES = ["All staff", "Leadership", "Executive", "Board", "HR only", "Owner only"];
export const TRANSITIONS: Record<string, string[]> = { draft: ["in_review"], in_review: ["approved", "draft"], approved: ["archived"], archived: [] };

class VaultError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}
export { VaultError };

const USER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const nameOf = (u) => (u ? [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email : null);
const txt = (v, max, label, required = false) => {
  const s = v == null ? "" : String(v).trim();
  if (!s) {
    if (required) throw new VaultError(`${label} is required.`);
    return null;
  }
  if (s.length > max) throw new VaultError(`${label} must be ${max} characters or fewer.`);
  return s;
};

async function decorate(rows) {
  const ids = [...new Set(rows.flatMap((d) => [d.ownerId, d.approvedById]).filter(Boolean))];
  const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: USER_SELECT }) : [];
  const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
  const now = Date.now();
  return rows.map((d) => ({
    ...d,
    ownerName: d.ownerId ? nm.get(d.ownerId) || null : null,
    approvedByName: d.approvedById ? nm.get(d.approvedById) || null : null,
    retentionLabel: d.retentionClass ? RETENTION_CLASSES[d.retentionClass]?.label || d.retentionClass : null,
    retentionActive: !!d.retentionUntil && +new Date(d.retentionUntil) > now,
    isAuthored: String(d.fileUrl || "").startsWith("inline:")
  }));
}

function retentionUntilFor(cls: string | null, from: Date) {
  const c = cls ? RETENTION_CLASSES[cls] : null;
  if (!c || c.years == null) return null;
  const d = new Date(from);
  d.setFullYear(d.getFullYear() + c.years);
  return d;
}

export class PerformanceVaultService {
  static meta() {
    return { folders: VAULT_FOLDERS, retentionClasses: Object.entries(RETENTION_CLASSES).map(([value, v]) => ({ value, label: v.label })), audiences: AUDIENCES };
  }

  static async list(scope: any = {}) {
    const rows = await prisma.performanceDocument.findMany({ where: scope, orderBy: { updatedAt: "desc" } });
    return decorate(rows);
  }

  static async get(id: string) {
    const doc = await prisma.performanceDocument.findUnique({ where: { id } });
    if (!doc) throw new VaultError("Document not found.", 404);
    const [versions, events] = await Promise.all([
      prisma.performanceDocumentVersion.findMany({ where: { documentId: id }, orderBy: { versionNo: "desc" }, select: { id: true, versionNo: true, fileUrl: true, mimeType: true, fileSizeBytes: true, changeNote: true, uploadedById: true, createdAt: true } }),
      prisma.performanceDocumentEvent.findMany({ where: { documentId: id }, orderBy: { createdAt: "desc" } })
    ]);
    const [d] = await decorate([doc]);
    const uids = [...new Set([...versions.map((v) => v.uploadedById), ...events.map((e) => e.actorId)].filter(Boolean))];
    const users = uids.length ? await prisma.user.findMany({ where: { id: { in: uids } }, select: USER_SELECT }) : [];
    const nm = new Map(users.map((u) => [u.id, nameOf(u)]));
    return { ...d, versions: versions.map((v) => ({ ...v, uploadedByName: v.uploadedById ? nm.get(v.uploadedById) || null : null })), events: events.map((e) => ({ ...e, actorName: e.actorId ? nm.get(e.actorId) || null : null })) };
  }

  private static async event(documentId, event, note, actorId) {
    await prisma.performanceDocumentEvent.create({ data: { documentId, event, note: note || null, actorId: actorId || null } });
  }

  private static validateMeta(input, requireAll) {
    const out: any = {};
    if (requireAll || input.name !== undefined) out.name = txt(input.name, 255, "Name", true);
    if (requireAll || input.folder !== undefined) {
      out.folder = txt(input.folder, 64, "Folder", true);
      if (!VAULT_FOLDERS.includes(out.folder)) throw new VaultError(`Folder must be one of: ${VAULT_FOLDERS.join(", ")}.`);
    }
    if (input.category !== undefined) out.category = txt(input.category, 64, "Category");
    if (input.audience !== undefined) {
      out.audience = txt(input.audience, 64, "Audience");
      if (out.audience && !AUDIENCES.includes(out.audience)) throw new VaultError(`Audience must be one of: ${AUDIENCES.join(", ")}.`);
    }
    if (requireAll || input.retentionClass !== undefined) {
      out.retentionClass = txt(input.retentionClass, 48, "Retention class", requireAll);
      if (out.retentionClass && !RETENTION_CLASSES[out.retentionClass]) throw new VaultError("Unknown retention class.");
    }
    if (input.ownerId !== undefined) out.ownerId = input.ownerId ? String(input.ownerId) : null;
    if (input.departmentId !== undefined) out.departmentId = input.departmentId ? String(input.departmentId) : null;
    return out;
  }

  /** Create a controlled document written in the vault itself (no file). */
  static async createAuthored(input: any, actor: any) {
    const meta = PerformanceVaultService.validateMeta(input, true);
    const content = txt(input.content, 500000, "Content", true);
    if (meta.ownerId) {
      if (!(await prisma.user.findUnique({ where: { id: meta.ownerId }, select: { id: true } }))) throw new VaultError("The chosen owner does not exist.");
    }
    const doc = await prisma.performanceDocument.create({
      data: { ...meta, ownerId: meta.ownerId || actor.id, audience: meta.audience || "All staff", version: "v1", currentVersionNo: 1, status: "draft", fileUrl: "inline:v1", mimeType: "text/html", fileSizeBytes: Buffer.byteLength(content), uploadedById: actor.id }
    });
    await prisma.performanceDocumentVersion.create({ data: { documentId: doc.id, versionNo: 1, fileUrl: "inline:v1", mimeType: "text/html", fileSizeBytes: Buffer.byteLength(content), content, changeNote: "Created", uploadedById: actor.id } });
    await PerformanceVaultService.event(doc.id, "created", null, actor.id);
    await AuditService.log({ userId: actor.id, action: "CREATE", entityType: "PerformanceDocument", entityId: doc.id, newValues: doc });
    return PerformanceVaultService.get(doc.id);
  }

  /** Upload a file as a new document. */
  static async upload(file: any, input: any, actor: any) {
    if (!file?.buffer?.length) throw new VaultError("Choose a file to upload.");
    const meta = PerformanceVaultService.validateMeta({ ...input, name: input.name || file.originalname }, true);
    if (meta.ownerId) {
      if (!(await prisma.user.findUnique({ where: { id: meta.ownerId }, select: { id: true } }))) throw new VaultError("The chosen owner does not exist.");
    }
    const { filePath, downloadURL } = await PerformanceDocumentService.uploadPerformanceDocumentFile({ buffer: file.buffer, fileName: file.originalname, mimeType: file.mimetype });
    const doc = await prisma.performanceDocument.create({
      data: { ...meta, ownerId: meta.ownerId || actor.id, audience: meta.audience || "All staff", version: "v1", currentVersionNo: 1, status: "draft", fileUrl: downloadURL, storagePath: filePath, mimeType: file.mimetype, fileSizeBytes: file.size, uploadedById: actor.id }
    });
    await prisma.performanceDocumentVersion.create({ data: { documentId: doc.id, versionNo: 1, fileUrl: downloadURL, storagePath: filePath, mimeType: file.mimetype, fileSizeBytes: file.size, changeNote: "Uploaded", uploadedById: actor.id } });
    await PerformanceVaultService.event(doc.id, "created", `Uploaded ${file.originalname}`, actor.id);
    await AuditService.log({ userId: actor.id, action: "CREATE", entityType: "PerformanceDocument", entityId: doc.id, newValues: doc });
    return PerformanceVaultService.get(doc.id);
  }

  static async updateMeta(id: string, input: any, actor: any) {
    const cur = await prisma.performanceDocument.findUnique({ where: { id } });
    if (!cur) throw new VaultError("Document not found.", 404);
    if (["in_review", "archived"].includes(cur.status)) throw new VaultError(`A document that is ${cur.status.replace("_", " ")} cannot be edited.`);
    const data = PerformanceVaultService.validateMeta(input, false);
    if (!Object.keys(data).length) throw new VaultError("Nothing to update.");
    const row = await prisma.performanceDocument.update({ where: { id }, data });
    await PerformanceVaultService.event(id, "edited", null, actor.id);
    await AuditService.log({ userId: actor.id, action: "UPDATE", entityType: "PerformanceDocument", entityId: id, oldValues: cur, newValues: row });
    return PerformanceVaultService.get(id);
  }

  /** A new version: an uploaded file, or new authored content. Editing an approved document sends it back to draft. */
  static async addVersion(id: string, file: any, input: any, actor: any) {
    const cur = await prisma.performanceDocument.findUnique({ where: { id } });
    if (!cur) throw new VaultError("Document not found.", 404);
    if (!["draft", "approved"].includes(cur.status)) throw new VaultError(`A document that is ${cur.status.replace("_", " ")} takes no new version.`);
    const note = txt(input.changeNote, 500, "Change note", true);
    const authored = String(cur.fileUrl).startsWith("inline:");
    const no = (cur.currentVersionNo || 1) + 1;
    let fileUrl, storagePath = null, mimeType, size, content = null;
    if (authored) {
      content = txt(input.content, 500000, "Content", true);
      fileUrl = `inline:v${no}`; mimeType = "text/html"; size = Buffer.byteLength(content);
    } else {
      if (!file?.buffer?.length) throw new VaultError("Choose the file for the new version.");
      const up = await PerformanceDocumentService.uploadPerformanceDocumentFile({ buffer: file.buffer, fileName: file.originalname, mimeType: file.mimetype });
      fileUrl = up.downloadURL; storagePath = up.filePath; mimeType = file.mimetype; size = file.size;
    }
    await prisma.performanceDocumentVersion.create({ data: { documentId: id, versionNo: no, fileUrl, storagePath, mimeType, fileSizeBytes: size, content, changeNote: note, uploadedById: actor.id } });
    await prisma.performanceDocument.update({ where: { id }, data: { version: `v${no}`, currentVersionNo: no, fileUrl, storagePath, mimeType, fileSizeBytes: size, status: "draft", approvedById: null, approvedAt: null, retentionUntil: null } });
    await PerformanceVaultService.event(id, "version", `v${no}: ${note}${cur.status === "approved" ? " (returned to draft for re-approval)" : ""}`, actor.id);
    await AuditService.log({ userId: actor.id, action: "VERSION", entityType: "PerformanceDocument", entityId: id, newValues: { version: no } });
    return PerformanceVaultService.get(id);
  }

  static async transition(id: string, to: string, note: any, actor: any, isAdmin: boolean) {
    const cur = await prisma.performanceDocument.findUnique({ where: { id } });
    if (!cur) throw new VaultError("Document not found.", 404);
    if (!(TRANSITIONS[cur.status] || []).includes(to)) throw new VaultError(`A document that is ${cur.status.replace("_", " ")} cannot move to ${to.replace("_", " ")}.`);
    const n = txt(note, 1000, "Note");
    const data: any = { status: to };
    let event = to;
    if (to === "in_review") {
      if (!cur.retentionClass) throw new VaultError("Set a retention class before submitting for review.");
      event = "submitted";
    }
    if (to === "approved") {
      if (!isAdmin && (cur.uploadedById === actor.id || cur.ownerId === actor.id)) throw new VaultError("You cannot approve a document you own or uploaded. Another approver is needed.");
      data.approvedById = actor.id; data.approvedAt = new Date(); data.retentionUntil = retentionUntilFor(cur.retentionClass, new Date());
    }
    if (to === "draft") {
      if (!n) throw new VaultError("Say what needs to change before the document goes back to draft.");
      event = "rejected";
    }
    if (to === "archived") {
      if (!n) throw new VaultError("Say why the document is being archived.");
    }
    const row = await prisma.performanceDocument.update({ where: { id }, data });
    await PerformanceVaultService.event(id, event, n, actor.id);
    await AuditService.log({ userId: actor.id, action: "STATUS", entityType: "PerformanceDocument", entityId: id, oldValues: { status: cur.status }, newValues: { status: to } });
    return PerformanceVaultService.get(row.id);
  }

  static async remove(id: string, actor: any) {
    const cur = await prisma.performanceDocument.findUnique({ where: { id } });
    if (!cur) throw new VaultError("Document not found.", 404);
    if (cur.status !== "draft") throw new VaultError("Only a draft can be deleted. Approved documents are archived, not deleted.");
    if (cur.retentionUntil && +new Date(cur.retentionUntil) > Date.now()) throw new VaultError("This document is under retention and cannot be deleted.");
    await prisma.performanceDocumentVersion.deleteMany({ where: { documentId: id } });
    await prisma.performanceDocumentEvent.deleteMany({ where: { documentId: id } });
    await prisma.performanceDocument.delete({ where: { id } });
    await AuditService.log({ userId: actor.id, action: "DELETE", entityType: "PerformanceDocument", entityId: id, oldValues: cur });
    return { id };
  }

  /** Authored content of a version, for preview and download. */
  static async content(id: string, versionNo?: number) {
    const doc = await prisma.performanceDocument.findUnique({ where: { id } });
    if (!doc) throw new VaultError("Document not found.", 404);
    const v = await prisma.performanceDocumentVersion.findFirst({ where: { documentId: id, versionNo: versionNo || doc.currentVersionNo || 1 } });
    if (!v) throw new VaultError("Version not found.", 404);
    return { name: doc.name, versionNo: v.versionNo, mimeType: v.mimeType, content: v.content, fileUrl: v.fileUrl };
  }
}
