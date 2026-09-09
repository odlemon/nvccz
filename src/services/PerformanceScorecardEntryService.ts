import { prisma } from "../utils/database";
import { remoteUploadService } from "./RemoteUploadService";

/**
 * Employee Scorecard workspace apparatus — notes, evidence uploads, update history and publish
 * events. One append-only event log per (employeeId, period), discriminated by `kind`, backing
 * what used to be entirely localStorage-only (V.notes/V.evidence/V.history/V.products) on the
 * Employee Scorecard page.
 *
 * Backing table: `performance_scorecard_entries` (scripts/run-performance-scorecard-entries-migration.ts).
 * Evidence upload reuses the same remoteUploadService pipeline as PerformanceDocumentService.
 */

export const SCORECARD_ENTRY_KINDS = ["note", "evidence", "history", "publish"] as const;
export type PerformanceScorecardEntryKind = (typeof SCORECARD_ENTRY_KINDS)[number];

const ENTRY_INCLUDE = {
  employee: { select: { id: true, firstName: true, lastName: true } },
  actor: { select: { id: true, firstName: true, lastName: true } },
} as const;

function trimmedOrUndefined(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

const SCORECARD_ENTRY_UPLOAD_TYPE = "performance-scorecard-entries";

export class PerformanceScorecardEntryService {
  /** All entries for one employee+period, newest first, grouped by kind by the caller. */
  static async listForEmployeePeriod(employeeId: string, period: string) {
    if (!trimmedOrUndefined(employeeId)) throw new Error("employeeId is required.");
    if (!trimmedOrUndefined(period)) throw new Error("period is required.");
    return prisma.performanceScorecardEntry.findMany({
      where: { employeeId, period },
      include: ENTRY_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
  }

  static async addNote(params: {
    employeeId: string;
    period: string;
    noteType?: string | null;
    text: string;
    actorId: string;
  }) {
    const employeeId = trimmedOrUndefined(params.employeeId);
    const period = trimmedOrUndefined(params.period);
    const text = trimmedOrUndefined(params.text);
    const actorId = trimmedOrUndefined(params.actorId);
    if (!employeeId) throw new Error("employeeId is required.");
    if (!period) throw new Error("period is required.");
    if (!text) throw new Error("text is required.");
    if (!actorId) throw new Error("actorId is required.");

    const [note] = await prisma.$transaction([
      prisma.performanceScorecardEntry.create({
        data: {
          employeeId,
          period,
          kind: "note",
          noteType: trimmedOrUndefined(params.noteType) ?? "General",
          text,
          actorId,
        },
        include: ENTRY_INCLUDE,
      }),
      prisma.performanceScorecardEntry.create({
        data: {
          employeeId,
          period,
          kind: "history",
          text: `${trimmedOrUndefined(params.noteType) ?? "Note"} added to the performance record.`,
          actorId,
        },
      }),
    ]);
    return note;
  }

  static async uploadEvidenceFile(params: {
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
        SCORECARD_ENTRY_UPLOAD_TYPE
      );
      return { filePath, downloadURL };
    } catch (error: any) {
      console.error("❌ Error uploading scorecard evidence:", error?.message);
      throw new Error(`Failed to upload scorecard evidence: ${error?.message}`);
    }
  }

  static async addEvidence(params: {
    employeeId: string;
    period: string;
    fileBuffer: Buffer;
    fileName: string;
    mimeType?: string;
    actorId: string;
  }) {
    const employeeId = trimmedOrUndefined(params.employeeId);
    const period = trimmedOrUndefined(params.period);
    const actorId = trimmedOrUndefined(params.actorId);
    if (!employeeId) throw new Error("employeeId is required.");
    if (!period) throw new Error("period is required.");
    if (!actorId) throw new Error("actorId is required.");
    if (!params.fileBuffer || !params.fileName) throw new Error("A file is required.");

    const { filePath, downloadURL } = await this.uploadEvidenceFile({
      buffer: params.fileBuffer,
      fileName: params.fileName,
      mimeType: params.mimeType,
    });

    const [evidence] = await prisma.$transaction([
      prisma.performanceScorecardEntry.create({
        data: {
          employeeId,
          period,
          kind: "evidence",
          text: params.fileName,
          fileUrl: downloadURL,
          storagePath: filePath,
          mimeType: params.mimeType ?? null,
          fileSizeBytes: params.fileBuffer.length,
          actorId,
        },
        include: ENTRY_INCLUDE,
      }),
      prisma.performanceScorecardEntry.create({
        data: {
          employeeId,
          period,
          kind: "history",
          text: `Evidence added: ${params.fileName}`,
          actorId,
        },
      }),
    ]);
    return evidence;
  }

  /** Record a scorecard/KPI update as a history entry — the update itself lives on PerformanceGoal. */
  static async addHistory(params: {
    employeeId: string;
    period: string;
    text: string;
    actorId: string;
  }) {
    const employeeId = trimmedOrUndefined(params.employeeId);
    const period = trimmedOrUndefined(params.period);
    const text = trimmedOrUndefined(params.text);
    const actorId = trimmedOrUndefined(params.actorId);
    if (!employeeId) throw new Error("employeeId is required.");
    if (!period) throw new Error("period is required.");
    if (!text) throw new Error("text is required.");
    if (!actorId) throw new Error("actorId is required.");

    return prisma.performanceScorecardEntry.create({
      data: { employeeId, period, kind: "history", text, actorId },
      include: ENTRY_INCLUDE,
    });
  }

  /** Publishing is an event, not a flag: "is published" = a publish entry with no later unpublish. */
  static async publish(params: { employeeId: string; period: string; actorId: string }) {
    const employeeId = trimmedOrUndefined(params.employeeId);
    const period = trimmedOrUndefined(params.period);
    const actorId = trimmedOrUndefined(params.actorId);
    if (!employeeId) throw new Error("employeeId is required.");
    if (!period) throw new Error("period is required.");
    if (!actorId) throw new Error("actorId is required.");

    const [publishEntry] = await prisma.$transaction([
      prisma.performanceScorecardEntry.create({
        data: { employeeId, period, kind: "publish", actorId },
        include: ENTRY_INCLUDE,
      }),
      prisma.performanceScorecardEntry.create({
        data: {
          employeeId,
          period,
          kind: "history",
          text: "Employee scorecard published from the governed performance review.",
          actorId,
        },
      }),
    ]);
    return publishEntry;
  }

  static async getPublicationStatus(employeeId: string, period: string) {
    const latest = await prisma.performanceScorecardEntry.findFirst({
      where: { employeeId, period, kind: "publish" },
      include: ENTRY_INCLUDE,
      orderBy: { createdAt: "desc" },
    });
    return latest
      ? { published: true, publishedAt: latest.createdAt, publishedBy: latest.actor }
      : { published: false, publishedAt: null, publishedBy: null };
  }

  static async deleteEntry(id: string) {
    const existing = await prisma.performanceScorecardEntry.findUnique({ where: { id } });
    if (!existing) throw new Error("Scorecard entry not found");
    await prisma.performanceScorecardEntry.delete({ where: { id } });
    return { message: "Scorecard entry deleted" };
  }
}
