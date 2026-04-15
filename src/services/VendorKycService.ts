// @ts-nocheck
import { prisma } from "../utils/database";
import { remoteUploadService } from "./RemoteUploadService";
import { encryptVendorArtifact } from "../utils/vendorArtifactCrypto";
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
    const uploads = await this.listForVendor(vendorId);
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
        filePath: true,
        fileSize: true,
        mimeType: true,
        isVerified: true,
        verifiedAt: true,
        uploadedById: true,
        createdAt: true,
        isEncrypted: true,
      },
    });
  }

  static async uploadEncrypted(params: {
    vendorId: string;
    documentType: string;
    file: Express.Multer.File;
    uploadedById: string;
  }) {
    const docType = this.assertDocumentType(params.documentType);
    const vendor = await prisma.vendor.findUnique({ where: { id: params.vendorId } });
    if (!vendor) throw new Error("Vendor not found");

    const { ciphertext, iv, authTag } = encryptVendorArtifact(params.file.buffer);
    const safeName = params.file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, "_");
    const remoteName = `${Date.now()}-${safeName}.enc`;

    const upload = await remoteUploadService.uploadSingleFile(
      {
        buffer: ciphertext,
        originalname: remoteName,
        mimetype: "application/octet-stream",
      },
      "application-documents"
    );

    const logicalPath = `/artifacts/vendor-kyc/${params.vendorId}/${remoteName}`;

    const row = await prisma.vendorKycDocument.create({
      data: {
        vendorId: params.vendorId,
        documentType: docType,
        fileName: params.file.originalname,
        fileUrl: upload.downloadURL,
        filePath: logicalPath,
        fileSize: ciphertext.length,
        mimeType: params.file.mimetype || "application/octet-stream",
        isEncrypted: true,
        encryptionIv: iv,
        encryptionAuthTag: authTag,
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
    const { decryptVendorArtifact } = await import("../utils/vendorArtifactCrypto");
    const doc = await prisma.vendorKycDocument.findUnique({ where: { id: documentId } });
    if (!doc) throw new Error("Document not found");
    if (!doc.isEncrypted || !doc.encryptionIv || !doc.encryptionAuthTag) {
      throw new Error("Document is not encrypted or missing crypto metadata");
    }
    const axios = (await import("axios")).default;
    const res = await axios.get(doc.fileUrl, { responseType: "arraybuffer", timeout: 60000 });
    const buf = Buffer.from(res.data);
    const plain = decryptVendorArtifact(buf, doc.encryptionIv, doc.encryptionAuthTag);
    return { buffer: plain, fileName: doc.fileName, mimeType: doc.mimeType };
  }
}
