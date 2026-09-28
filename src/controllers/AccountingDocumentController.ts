//@ts-nocheck
import { Request, Response } from 'express';
import { AccountingDocumentService } from '../services/AccountingDocumentService';
import { FirebaseStorageService } from '../services/FirebaseStorageService';

/**
 * Accounting Document Vault (accounting-v52). Mirrors FundController's listDocuments/uploadDocument,
 * minus the fundId scoping — this vault is company-wide.
 */
export class AccountingDocumentController {
  /**
   * List all accounting documents
   */
  static async list(req: Request, res: Response) {
    try {
      const documents = await AccountingDocumentService.listAccountingDocuments();
      res.status(200).json({ success: true, data: documents });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }

  /**
   * Upload a document to the accounting document vault
   */
  static async upload(req: Request, res: Response) {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ success: false, message: 'No file uploaded' });
        return;
      }
      // documents a finance team keeps: papers, spreadsheets, images, text and archives; nothing that runs
      const ext = String(file.originalname || '').toLowerCase().split('.').pop();
      if (!['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'ppt', 'pptx', 'zip', 'msg', 'eml', 'xml', 'json'].includes(ext || '')) {
        res.status(400).json({ success: false, message: `A .${ext} file cannot be kept in the vault. Upload a PDF, Office document, spreadsheet, image, text or zip file.` });
        return;
      }
      const category = String(req.body.category || 'General').slice(0, 64);
      const { filePath, downloadURL } = await FirebaseStorageService.uploadAccountingDocument(
        file.buffer,
        file.originalname,
        category
      );
      const uploadedById = (req as any).user?.id;
      const document = await AccountingDocumentService.createAccountingDocument({
        name: file.originalname,
        category,
        fileUrl: downloadURL,
        storagePath: filePath,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        uploadedById,
      });
      if (uploadedById) {
        const { default: AuditService } = await import('../services/AuditService');
        await AuditService.log({ userId: uploadedById, action: 'CREATE', entityType: 'AccountingDocument', entityId: document.id, newValues: { name: document.name, category, sizeBytes: file.size, mimeType: file.mimetype } }).catch(() => null);
      }
      res.status(201).json({ success: true, data: document, message: 'Document uploaded successfully' });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
