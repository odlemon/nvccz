// @ts-nocheck
import { prisma } from "../utils/database";
import AuditService from "./AuditService";
import {
  DEFAULT_ALLOWED_FILE_TYPES,
  DEFAULT_MAX_ATTACHMENTS_PER_RECORD,
  DEFAULT_MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_CEILING_BYTES,
  MIN_FILE_SIZE_BYTES,
  PDF_MIME
} from "../constants/vendorDocumentAttachment";

export type AllowedFileTypeEntry = {
  mimeType: string;
  extensions: string[];
  label: string;
  enabled: boolean;
};

function normalizeAllowedFileTypes(raw: unknown): AllowedFileTypeEntry[] {
  if (!Array.isArray(raw)) return [...DEFAULT_ALLOWED_FILE_TYPES];
  const out: AllowedFileTypeEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const mimeType = String(rec.mimeType || "").trim().toLowerCase();
    if (!mimeType) continue;
    const extensions = Array.isArray(rec.extensions)
      ? rec.extensions.map((e) => String(e).trim().toLowerCase().replace(/^\./, "")).filter(Boolean)
      : [];
    const label = String(rec.label || mimeType).trim();
    const enabled = rec.enabled !== false;
    out.push({ mimeType, extensions, label, enabled });
  }
  return out.length ? out : [...DEFAULT_ALLOWED_FILE_TYPES];
}

function assertPdfInAllowedList(types: AllowedFileTypeEntry[]) {
  const pdfEnabled = types.some((t) => t.mimeType === PDF_MIME && t.enabled !== false);
  if (!pdfEnabled) {
    throw new Error("PDF (application/pdf) must remain in allowed file types and enabled");
  }
}

export class VendorDocumentUploadSettingsService {
  static async getSettings() {
    let row = await prisma.vendorDocumentUploadSettings.findUnique({ where: { id: "default" } });
    if (!row) {
      row = await prisma.vendorDocumentUploadSettings.create({
        data: {
          id: "default",
          maxFileSizeBytes: DEFAULT_MAX_FILE_SIZE_BYTES,
          allowedFileTypes: DEFAULT_ALLOWED_FILE_TYPES,
          maxAttachmentsPerRecord: DEFAULT_MAX_ATTACHMENTS_PER_RECORD
        }
      });
    }
    return {
      id: row.id,
      maxFileSizeBytes: row.maxFileSizeBytes,
      allowedFileTypes: normalizeAllowedFileTypes(row.allowedFileTypes),
      maxAttachmentsPerRecord: row.maxAttachmentsPerRecord,
      updatedAt: row.updatedAt
    };
  }

  static getPublicSettingsView(settings: Awaited<ReturnType<typeof VendorDocumentUploadSettingsService.getSettings>>) {
    return {
      maxFileSizeBytes: settings.maxFileSizeBytes,
      maxAttachmentsPerRecord: settings.maxAttachmentsPerRecord,
      allowedFileTypes: settings.allowedFileTypes
        .filter((t) => t.enabled)
        .map(({ mimeType, extensions, label }) => ({ mimeType, extensions, label }))
    };
  }

  static async updateSettings(params: {
    maxFileSizeBytes?: number;
    allowedFileTypes?: AllowedFileTypeEntry[];
    maxAttachmentsPerRecord?: number;
    userId?: string;
    meta?: { ipAddress?: string; userAgent?: string };
  }) {
    const current = await this.getSettings();
    const maxFileSizeBytes =
      params.maxFileSizeBytes != null ? Number(params.maxFileSizeBytes) : current.maxFileSizeBytes;
    const maxAttachmentsPerRecord =
      params.maxAttachmentsPerRecord != null
        ? Number(params.maxAttachmentsPerRecord)
        : current.maxAttachmentsPerRecord;
    const allowedFileTypes = normalizeAllowedFileTypes(
      params.allowedFileTypes ?? current.allowedFileTypes
    );

    if (maxFileSizeBytes < MIN_FILE_SIZE_BYTES || maxFileSizeBytes > MAX_FILE_SIZE_CEILING_BYTES) {
      throw new Error(
        `maxFileSizeBytes must be between ${MIN_FILE_SIZE_BYTES} and ${MAX_FILE_SIZE_CEILING_BYTES}`
      );
    }
    if (maxAttachmentsPerRecord < 1 || maxAttachmentsPerRecord > 20) {
      throw new Error("maxAttachmentsPerRecord must be between 1 and 20");
    }
    assertPdfInAllowedList(allowedFileTypes);

    const updated = await prisma.vendorDocumentUploadSettings.upsert({
      where: { id: "default" },
      create: {
        id: "default",
        maxFileSizeBytes,
        allowedFileTypes,
        maxAttachmentsPerRecord
      },
      update: {
        maxFileSizeBytes,
        allowedFileTypes,
        maxAttachmentsPerRecord
      }
    });

    await AuditService.log({
      userId: params.userId,
      action: "VENDOR_DOCUMENT_SETTINGS_UPDATED",
      entityType: "VendorDocumentUploadSettings",
      entityId: "default",
      oldValues: current,
      newValues: {
        maxFileSizeBytes: updated.maxFileSizeBytes,
        allowedFileTypes: updated.allowedFileTypes,
        maxAttachmentsPerRecord: updated.maxAttachmentsPerRecord
      },
      ipAddress: params.meta?.ipAddress,
      userAgent: params.meta?.userAgent
    }).catch((err) => console.error("Audit log (vendor document settings) failed:", err));

    return {
      id: updated.id,
      maxFileSizeBytes: updated.maxFileSizeBytes,
      allowedFileTypes: normalizeAllowedFileTypes(updated.allowedFileTypes),
      maxAttachmentsPerRecord: updated.maxAttachmentsPerRecord,
      updatedAt: updated.updatedAt
    };
  }
}
