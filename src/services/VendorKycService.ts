// @ts-nocheck
import { prisma } from "../utils/database";
import {
  remoteUploadService,
  rewritePublicMediaUrl,
  extractRelativeMediaPath,
  collapseDuplicatePublicMediaPath,
  resolveMediaBaseUrl,
} from "./RemoteUploadService";
import { FirebaseStorageService } from "./FirebaseStorageService";
import { VENDOR_PORTAL_ACTOR_ID } from "../constants/vendorPortalActor";

export const VENDOR_PORTAL_KYC_UPLOADED_BY = VENDOR_PORTAL_ACTOR_ID;

/**
 * Portal KYC slots: each upload must set multipart field `documentType` to exactly one `code`.
 * Use {@link VendorKycService.getPortalKycRequirements} for labels and completion status.
 */
export const VENDOR_KYC_PORTAL_DOCUMENT_TYPES: {
  code: string;
  label: string;
  description: string;
  requiredForPortal: boolean;
}[] = [
  {
    code: "CERTIFICATE_OF_INCORPORATION",
    label: "Certificate of incorporation",
    description: "Company registration certificate from the Registrar of Companies.",
    requiredForPortal: true,
  },
  {
    code: "CR14",
    label: "CR14 — company extract",
    description: "CR14 extract (shareholders, directors, registered office).",
    requiredForPortal: true,
  },
  {
    code: "BANK_LETTER",
    label: "Bank confirmation / account letter",
    description: "Signed bank letter or stamped confirmation of the business account details.",
    requiredForPortal: true,
  },
  {
    code: "ITF263",
    label: "ZIMRA tax clearance (ITF 263)",
    description: "Scanned ITF263 certificate if not already captured at registration.",
    requiredForPortal: false,
  },
  {
    code: "OTHER",
    label: "Other supporting document",
    description: "Any additional document procurement may request (licences, references, etc.).",
    requiredForPortal: false,
  },
];

const ALLOWED_TYPES = new Set(VENDOR_KYC_PORTAL_DOCUMENT_TYPES.map((d) => d.code));

const TYPE_LABEL_BY_CODE = Object.fromEntries(
  VENDOR_KYC_PORTAL_DOCUMENT_TYPES.map((d) => [d.code, d.label])
);

function guessMimeFromFileName(fileName: string): string | null {
  const n = String(fileName || "").toLowerCase();
  const i = n.lastIndexOf(".");
  const ext = i >= 0 ? n.slice(i + 1) : "";
  const map: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    txt: "text/plain",
    csv: "text/csv",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  return map[ext] || null;
}

export class VendorKycService {
  static assertDocumentType(t: string) {
    const u = String(t || "").trim().toUpperCase().replace(/\s+/g, "_");
    if (!ALLOWED_TYPES.has(u)) {
      const hint = VENDOR_KYC_PORTAL_DOCUMENT_TYPES.map(
        (d) => `${d.code} (${d.label})`
      ).join("; ");
      throw new Error(`Invalid documentType. Use one of: ${hint}`);
    }
    return u;
  }

  /**
   * Token-scoped: document type catalog, current uploads, and which required types are still missing.
   */
  static async getPortalKycRequirements(token: string) {
    const { VendorSelfRegistrationService } = await import("./VendorSelfRegistrationService");
    const { id: vendorId } = await VendorSelfRegistrationService.assertTokenOpenForPortalKyc(token);
    const uploadsRaw = await this.listForVendor(vendorId);
    const uploads = uploadsRaw.map((u) => this.formatKycDocumentResponse(u));
    const requiredCodes = VENDOR_KYC_PORTAL_DOCUMENT_TYPES.filter((d) => d.requiredForPortal).map(
      (d) => d.code
    );
    const uploadedTypes = new Set(uploads.map((u) => u.documentType));
    const missingRequired = requiredCodes.filter((c) => !uploadedTypes.has(c));
    return {
      documentTypes: VENDOR_KYC_PORTAL_DOCUMENT_TYPES,
      uploads,
      missingRequired,
      portalComplete: missingRequired.length === 0,
      uploadInstructions: {
        method: "POST",
        pathPattern: "/api/public/vendor-registration/:token/kyc-documents",
        contentType: "multipart/form-data",
        fields: {
          optionA_singleSlot:
            "Field `file` (File) + text field `documentType` with the code (e.g. CR14).",
          optionB_namedSlots:
            "Or name each file field with the document code itself (e.g. CR14, BANK_LETTER) — no separate documentType needed.",
        },
      },
    };
  }

  static documentTypeLabel(code: string): string | undefined {
    return TYPE_LABEL_BY_CODE[String(code || "").trim().toUpperCase()];
  }

  static async listForVendor(vendorId: string) {
    return prisma.vendorKycDocument.findMany({
      where: { vendorId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        vendorId: true,
        documentType: true,
        fileName: true,
        fileUrl: true,
        isVerified: true,
        verifiedById: true,
        verifiedAt: true,
        uploadedById: true,
        createdAt: true,
        updatedAt: true,
        isEncrypted: true,
      },
    });
  }

  /**
   * Single browser-openable `fileUrl` for API responses and DB persistence.
   * Pipeline: collapse duplicate `/api/public-media/` segments → {@link rewritePublicMediaUrl} when the
   * stored value still carries `/uploads/` or `/api/public-media/` → if still not absolute, resolve against
   * `BASE_URL` / `API_PUBLIC_BASE_URL` / `FRONTEND_URL` for path-only `/api/...` → else prefix with
   * {@link resolveMediaBaseUrl} when that base is already absolute (covers relative keys like `application-documents/...`).
   */
  static resolveKycFileUrlForResponse(stored: string | null | undefined): string | null {
    const raw = String(stored || "").trim();
    if (!raw) return null;
    let u = collapseDuplicatePublicMediaPath(raw);
    const rw = rewritePublicMediaUrl(u);
    if (rw != null && rw !== "") u = String(rw);

    if (!/^https?:\/\//i.test(u)) {
      const originForJoin = (
        process.env.BASE_URL ||
        process.env.API_PUBLIC_BASE_URL ||
        process.env.FRONTEND_URL ||
        ""
      )
        .trim()
        .replace(/\/+$/, "");
      if (u.startsWith("/") && originForJoin && /^https?:\/\//i.test(originForJoin)) {
        try {
          const baseWithSlash = originForJoin.endsWith("/") ? originForJoin : `${originForJoin}/`;
          u = new URL(u, baseWithSlash).href;
        } catch {
          /* fall through */
        }
      }
    }

    if (!/^https?:\/\//i.test(u)) {
      const base = resolveMediaBaseUrl().replace(/\/+$/, "");
      if (/^https?:\/\//i.test(base)) {
        const rel = u.replace(/^\/+/, "");
        u = `${base}/${rel}`;
      }
    }
    return u;
  }

  /** Staff, portal, and nested vendor payloads: only id, type, name, absolute fileUrl, verification, encryption flag, timestamps. */
  static formatKycDocumentResponse(d: Record<string, unknown>) {
    const fileUrl = this.resolveKycFileUrlForResponse(
      d.fileUrl != null && String(d.fileUrl).trim() ? String(d.fileUrl) : null
    );
    return {
      id: d.id,
      vendorId: d.vendorId,
      documentType: d.documentType,
      fileName: d.fileName,
      fileUrl,
      isVerified: d.isVerified,
      verifiedById: d.verifiedById,
      verifiedAt: d.verifiedAt,
      uploadedById: d.uploadedById,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      isEncrypted: d.isEncrypted,
    };
  }

  /**
   * Same as portfolio application uploads (`ApplicationController` / `FirebaseStorageService.uploadApplicationDocument`):
   * persist `downloadURL` from the remote upload service as `fileUrl` (no extra rewriting at insert time).
   * Legacy DB rows may still use at-rest encryption (`isEncrypted: true`).
   */
  static async uploadEncrypted(params: {
    vendorId: string;
    documentType: string;
    file: Express.Multer.File;
    uploadedById: string;
  }) {
    const docType = this.assertDocumentType(params.documentType);
    const vendor = await prisma.vendor.findUnique({ where: { id: params.vendorId } });
    if (!vendor) throw new Error("Vendor not found");

    const { downloadURL } = await FirebaseStorageService.uploadApplicationDocument(
      params.file.buffer,
      params.file.originalname,
      params.vendorId,
      docType
    );

    const row = await prisma.vendorKycDocument.create({
      data: {
        vendorId: params.vendorId,
        documentType: docType,
        fileName: params.file.originalname,
        fileUrl: downloadURL,
        isEncrypted: false,
        encryptionIv: null,
        encryptionAuthTag: null,
        uploadedById: params.uploadedById,
      },
    });

    return row;
  }

  /** KYC upload from vendor portal — token proves identity; no staff JWT. */
  static async uploadEncryptedViaPortalToken(params: {
    token: string;
    documentType: string;
    file: Express.Multer.File;
  }) {
    const { VendorSelfRegistrationService } = await import("./VendorSelfRegistrationService");
    const { id: vendorId } = await VendorSelfRegistrationService.assertTokenOpenForPortalKyc(
      params.token
    );
    return this.uploadEncrypted({
      vendorId,
      documentType: params.documentType,
      file: params.file,
      uploadedById: VENDOR_PORTAL_KYC_UPLOADED_BY,
    });
  }

  static async listForPortalToken(token: string) {
    const { VendorSelfRegistrationService } = await import("./VendorSelfRegistrationService");
    const { id: vendorId } = await VendorSelfRegistrationService.assertTokenOpenForPortalKyc(token);
    return this.listForVendor(vendorId);
  }

  static async getDecryptedBufferForPortalToken(token: string, documentId: string) {
    const { VendorSelfRegistrationService } = await import("./VendorSelfRegistrationService");
    const { id: vendorId } = await VendorSelfRegistrationService.assertTokenOpenForPortalKyc(token);
    const doc = await prisma.vendorKycDocument.findFirst({
      where: { id: documentId, vendorId },
    });
    if (!doc) {
      throw new Error("Document not found");
    }
    return this.getDecryptedBuffer(documentId);
  }

  static async getDecryptedBuffer(documentId: string): Promise<{
    buffer: Buffer;
    fileName: string;
    mimeType: string | null;
  }> {
    const doc = await prisma.vendorKycDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error("Document not found");

    const url = doc.fileUrl && String(doc.fileUrl).trim();
    if (!url) {
      throw new Error("Document has no retrievable file URL");
    }

    const axios = (await import("axios")).default;
    const fetchUrl = rewritePublicMediaUrl(url) ?? url;
    let raw: Buffer;
    try {
      const res = await axios.get(fetchUrl, { responseType: "arraybuffer", timeout: 60000 });
      raw = Buffer.from(res.data);
    } catch {
      const rel = extractRelativeMediaPath(url);
      if (!rel || String(rel).startsWith("/artifacts")) {
        throw new Error("Document file could not be retrieved from storage");
      }
      raw = await remoteUploadService.downloadFile(rel);
    }

    const mimeType = guessMimeFromFileName(doc.fileName);

    if (!doc.isEncrypted) {
      return { buffer: raw, fileName: doc.fileName, mimeType };
    }

    const { decryptVendorArtifact } = await import("../utils/vendorArtifactCrypto");
    if (!doc.encryptionIv || !doc.encryptionAuthTag) {
      throw new Error("Document is marked encrypted but missing crypto metadata");
    }
    const plain = decryptVendorArtifact(raw, doc.encryptionIv, doc.encryptionAuthTag);
    return { buffer: plain, fileName: doc.fileName, mimeType };
  }
}
