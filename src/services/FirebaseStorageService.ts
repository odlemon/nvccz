// @ts-nocheck
// Firebase Storage Service - Now uses RemoteUploadService instead of Firebase
// Maintains same interface for backward compatibility
// All uploads now go to custom Ubuntu server

import { remoteUploadService } from './RemoteUploadService';

export class FirebaseStorageService {
  /**
   * Upload CSV file to Remote Server (replaces Firebase)
   */
  static async uploadImportFile(
    file: Buffer,
    fileName: string,
    batchId: string,
    userId: string
  ): Promise<{ filePath: string; downloadURL: string }> {
    try {
      console.log(`📁 Uploading import file: ${fileName}`);

      // Upload to remote server
      const result = await remoteUploadService.uploadSingleFile(
        {
          buffer: file,
          originalname: fileName,
          mimetype: 'text/csv',
        },
        'cashbook-imports'
      );

      console.log(`✅ File uploaded successfully: ${result.downloadURL}`);

      return {
        filePath: `cashbook-imports/${userId}/${batchId}/${fileName}`, // Keep path format for backward compatibility
        downloadURL: result.downloadURL
      };

    } catch (error: any) {
      console.error('❌ Error uploading file:', error.message);
      throw new Error(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Upload a financial report document for a portfolio company (replaces Firebase)
   */
  static async uploadFinancialReport(
    file: Buffer,
    portfolioCompanyId: string,
    reportId: string,
    fileName: string
  ): Promise<{ filePath: string; downloadURL: string }> {
    try {
      console.log(`📁 Uploading financial report ${fileName} for company ${portfolioCompanyId}`);

      const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      
      // Upload to remote server
      const result = await remoteUploadService.uploadSingleFile(
        {
          buffer: file,
          originalname: sanitizedName,
          mimetype: 'application/pdf',
        },
        'financial-reports'
      );

      return {
        filePath: `financial-reports/${portfolioCompanyId}/${reportId}/${sanitizedName}`, // Keep path format
        downloadURL: result.downloadURL
      };
    } catch (error: any) {
      console.error('❌ Error uploading financial report:', error.message);
      throw new Error(`Failed to upload financial report: ${error.message}`);
    }
  }

  /**
   * Upload an application document to Remote Server (replaces Firebase)
   */
  static async uploadApplicationDocument(
    file: Buffer,
    fileName: string,
    applicationId: string,
    documentType: string
  ): Promise<{ filePath: string; downloadURL: string }> {
    try {
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const safeApplicationId = applicationId || 'unassigned';
      const safeDocumentType = documentType || 'GENERAL';
      const timestamp = Date.now();

      // Upload to remote server
      const result = await remoteUploadService.uploadSingleFile(
        {
          buffer: file,
          originalname: `${timestamp}-${sanitizedName}`,
          mimetype: this.getMimeType(fileName),
        },
        'application-documents'
      );

      return {
        filePath: `application-documents/${safeApplicationId}/${safeDocumentType}/${timestamp}-${sanitizedName}`, // Keep path format
        downloadURL: result.downloadURL
      };
    } catch (error: any) {
      console.error('❌ Error uploading application document:', error.message);
      throw new Error(`Failed to upload application document: ${error.message}`);
    }
  }

  /**
   * Upload a term sheet document to Remote Server (replaces Firebase)
   */
  static async uploadTermSheetDocument(
    file: Buffer,
    fileName: string,
    termSheetId: string,
    documentType: string
  ): Promise<{ filePath: string; downloadURL: string }> {
    try {
      const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const safeTermSheetId = termSheetId || 'unassigned';
      const safeDocumentType = documentType || 'GENERAL';
      const timestamp = Date.now();

      // Upload to remote server
      const result = await remoteUploadService.uploadSingleFile(
        {
          buffer: file,
          originalname: `${timestamp}-${sanitizedName}`,
          mimetype: this.getMimeType(fileName),
        },
        'term-sheets'
      );

      return {
        filePath: `term-sheets/${safeTermSheetId}/${safeDocumentType}/${timestamp}-${sanitizedName}`, // Keep path format
        downloadURL: result.downloadURL
      };
    } catch (error: any) {
      console.error('❌ Error uploading term sheet document:', error.message);
      throw new Error(`Failed to upload term sheet document: ${error.message}`);
    }
  }

  /**
   * Download file from Remote Server (replaces Firebase)
   */
  static async downloadImportFile(filePath: string): Promise<Buffer> {
    try {
      console.log(`📥 Downloading file from remote server: ${filePath}`);
      return await remoteUploadService.downloadFile(filePath);
    } catch (error: any) {
      console.error('❌ Error downloading file:', error.message);
      throw new Error(`Failed to download file: ${error.message}`);
    }
  }

  /**
   * Upload term sheet signature to Remote Server (replaces Firebase)
   */
  static async uploadTermSheetSignature(
    file: Buffer,
    applicationId: string,
    termSheetId: string,
    signatureType: 'applicant' | 'investor',
    fileName: string
  ): Promise<{ filePath: string; downloadURL: string }> {
    try {
      console.log(`📁 Uploading ${signatureType} signature for term sheet ${termSheetId}`);

      const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const timestamp = Date.now();

      // Upload to remote server
      const result = await remoteUploadService.uploadSingleFile(
        {
          buffer: file,
          originalname: `${signatureType}-${timestamp}-${sanitizedName}`,
          mimetype: this.getMimeType(fileName),
        },
        'term-sheet-signatures'
      );

      console.log(`✅ Signature uploaded successfully: ${result.downloadURL}`);

      return {
        filePath: `term-sheet-signatures/${applicationId}/${termSheetId}/${signatureType}-${timestamp}-${sanitizedName}`, // Keep path format
        downloadURL: result.downloadURL
      };
    } catch (error: any) {
      console.error('❌ Error uploading signature:', error.message);
      throw new Error(`Failed to upload signature: ${error.message}`);
    }
  }

  /**
   * Delete file from Remote Server (replaces Firebase)
   */
  static async deleteFile(filePath: string): Promise<void> {
    try {
      console.log(`🗑️ Deleting file from remote server: ${filePath}`);
      await remoteUploadService.deleteFile(filePath);
      console.log(`✅ File deleted successfully: ${filePath}`);
    } catch (error: any) {
      console.error('❌ Error deleting file:', error.message);
      throw new Error(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * List all files under a specific path (replaces Firebase)
   */
  static async listFiles(path: string): Promise<string[]> {
    try {
      console.log(`📄 Listing files in remote server path: ${path}`);
      return await remoteUploadService.listFiles(path);
    } catch (error: any) {
      console.error('❌ Error listing files:', error.message);
      throw new Error(`Failed to list files: ${error.message}`);
    }
  }

  /**
   * Helper method to determine MIME type from filename
   */
  private static getMimeType(fileName: string): string {
    const ext = fileName.toLowerCase().split('.').pop() || '';
    const mimeTypes: Record<string, string> = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'csv': 'text/csv',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'txt': 'text/plain',
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}

export default FirebaseStorageService;


