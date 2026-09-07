//@ts-nocheck
import { prisma } from '../utils/database';

/**
 * Accounting Document Vault (accounting-v52). Company-wide document store — not scoped to a
 * fund or any other parent record. Mirrors FundService's listFundDocuments/createFundDocument.
 */
export class AccountingDocumentService {
  static async listAccountingDocuments() {
    return prisma.accountingDocument.findMany({
      orderBy: { createdAt: 'desc' },
      include: { uploadedBy: { select: { id: true, firstName: true, lastName: true } } },
    });
  }

  /**
   * Record an accounting document after it has been uploaded to storage.
   */
  static async createAccountingDocument(params: {
    name: string;
    category: string;
    fileUrl: string;
    storagePath?: string;
    mimeType?: string;
    fileSizeBytes?: number;
    uploadedById?: string;
  }) {
    return prisma.accountingDocument.create({
      data: {
        name: params.name,
        category: params.category,
        fileUrl: params.fileUrl,
        storagePath: params.storagePath,
        mimeType: params.mimeType,
        fileSizeBytes: params.fileSizeBytes,
        uploadedById: params.uploadedById,
      },
    });
  }
}
