jest.mock("../utils/database", () => ({
  prisma: {
    vendorDocumentUploadSettings: {
      findUnique: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn()
    },
    vendorDocumentAttachment: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    vendorQuotation: { findUnique: jest.fn(), update: jest.fn() },
    procurementInvoice: { findUnique: jest.fn(), update: jest.fn() },
    purchaseInvoice: { findUnique: jest.fn() }
  }
}));

jest.mock("../services/AuditService", () => ({
  __esModule: true,
  default: { log: jest.fn().mockResolvedValue(undefined) }
}));

jest.mock("../services/FirebaseStorageService", () => ({
  FirebaseStorageService: {
    uploadVendorRecordAttachment: jest.fn().mockResolvedValue({
      filePath: "vendor-record-attachments/test/file.pdf",
      downloadURL: "https://example.com/api/public-media/vendor-record-attachments/test/file.pdf"
    })
  }
}));

import { prisma } from "../utils/database";
import AuditService from "../services/AuditService";
import { VendorDocumentUploadSettingsService } from "../services/VendorDocumentUploadSettingsService";
import { VendorDocumentAttachmentService } from "../services/VendorDocumentAttachmentService";
import { PDF_MIME } from "../constants/vendorDocumentAttachment";

const mockSettingsFind = prisma.vendorDocumentUploadSettings.findUnique as jest.Mock;
const mockSettingsUpsert = prisma.vendorDocumentUploadSettings.upsert as jest.Mock;
const mockAttachmentCreate = prisma.vendorDocumentAttachment.create as jest.Mock;
const mockAudit = AuditService.log as jest.Mock;

const defaultSettingsRow = {
  id: "default",
  maxFileSizeBytes: 15 * 1024 * 1024,
  allowedFileTypes: [
    { mimeType: PDF_MIME, extensions: ["pdf"], label: "PDF", enabled: true }
  ],
  maxAttachmentsPerRecord: 5,
  updatedAt: new Date()
};

function pdfBuffer(content = "sample") {
  return Buffer.from(`%PDF-1.4\n${content}`);
}

describe("VendorDocumentUploadSettingsService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSettingsFind.mockResolvedValue(defaultSettingsRow);
    mockSettingsUpsert.mockImplementation(async ({ update }) => ({
      ...defaultSettingsRow,
      ...update
    }));
  });

  test("getSettings returns defaults when row exists", async () => {
    const s = await VendorDocumentUploadSettingsService.getSettings();
    expect(s.maxFileSizeBytes).toBe(15 * 1024 * 1024);
    expect(s.allowedFileTypes[0].mimeType).toBe(PDF_MIME);
  });

  test("updateSettings rejects when PDF disabled", async () => {
    await expect(
      VendorDocumentUploadSettingsService.updateSettings({
        allowedFileTypes: [
          { mimeType: "image/png", extensions: ["png"], label: "PNG", enabled: true }
        ],
        userId: "u1"
      })
    ).rejects.toThrow(/PDF/i);
  });

  test("updateSettings logs audit on success", async () => {
    await VendorDocumentUploadSettingsService.updateSettings({
      maxFileSizeBytes: 10 * 1024 * 1024,
      userId: "u1"
    });
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VENDOR_DOCUMENT_SETTINGS_UPDATED" })
    );
  });
});

describe("VendorDocumentAttachmentService.validateFile", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSettingsFind.mockResolvedValue(defaultSettingsRow);
  });

  test("accepts valid PDF", async () => {
    const buf = pdfBuffer();
    const result = await VendorDocumentAttachmentService.validateFile(
      buf,
      "quote.pdf",
      PDF_MIME
    );
    expect(result.normalizedMime).toBe(PDF_MIME);
  });

  test("rejects oversize file", async () => {
    const huge = pdfBuffer("x".repeat(20 * 1024 * 1024));
    await expect(
      VendorDocumentAttachmentService.validateFile(huge, "big.pdf", PDF_MIME)
    ).rejects.toThrow(/maximum size/i);
  });

  test("rejects invalid PDF magic bytes", async () => {
    await expect(
      VendorDocumentAttachmentService.validateFile(
        Buffer.from("NOTPDF"),
        "fake.pdf",
        PDF_MIME
      )
    ).rejects.toThrow(/integrity/i);
  });

  test("rejects disallowed mime type", async () => {
    await expect(
      VendorDocumentAttachmentService.validateFile(
        Buffer.from("hello"),
        "file.txt",
        "text/plain"
      )
    ).rejects.toThrow(/not allowed/i);
  });
});

describe("VendorDocumentAttachmentService.upload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSettingsFind.mockResolvedValue(defaultSettingsRow);
    (prisma.vendorDocumentAttachment.count as jest.Mock).mockResolvedValue(0);
    (prisma.vendorDocumentAttachment.findMany as jest.Mock).mockResolvedValue([]);
    mockAttachmentCreate.mockImplementation(async ({ data }) => ({
      id: "att1",
      ...data,
      createdAt: new Date(),
      updatedAt: new Date()
    }));
  });

  test("staff upload creates attachment row and audits", async () => {
    (prisma.vendorQuotation.findUnique as jest.Mock).mockResolvedValue({
      id: "q1",
      vendorId: "v1"
    });

    const result = await VendorDocumentAttachmentService.upload({
      file: {
        buffer: pdfBuffer(),
        originalname: "quotation.pdf",
        mimetype: PDF_MIME
      } as Express.Multer.File,
      entityType: "VENDOR_QUOTATION",
      entityId: "q1",
      actor: { kind: "staff", userId: "staff1" }
    });

    expect(result.id).toBe("att1");
    expect(mockAttachmentCreate).toHaveBeenCalled();
    expect(mockAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VENDOR_DOCUMENT_UPLOADED" })
    );
  });
});
