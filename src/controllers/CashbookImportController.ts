// @ts-nocheck
// Cashbook Import Controller
// Handles CSV file uploads and import processing

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import CashbookImportService from "../services/CashbookImportService";
import FirebaseStorageService from "../services/FirebaseStorageService";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

export default class CashbookImportController {
  
  /**
   * Upload and process CSV import file
   * POST /api/cashbook/import/upload
   */
  static async uploadImportFile(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      // Get uploaded file
      const file = req.file;
      if (!file) {
        return ResponseHelper.badRequest(res, 'No file uploaded.');
      }
      
      // Validate file type
      if (!file.mimetype.includes('csv') && !file.mimetype.includes('text/csv')) {
        return ResponseHelper.badRequest(res, 'Only CSV files are allowed.');
      }
      
      // Validate file size (10MB limit)
      const maxSize = 10 * 1024 * 1024; // 10MB
      if (file.size > maxSize) {
        return ResponseHelper.badRequest(res, 'File size must be less than 10MB.');
      }
      
      console.log(`📥 Processing import file: ${file.originalname} (${file.size} bytes)`);
      
      // Process import file
      const result = await CashbookImportService.processImportFile(
        file.buffer,
        file.originalname,
        userId,
        req.body.mappings || {}
      );
      
      return ResponseHelper.success(res, 'Import file processed successfully', result);
      
    } catch (error: any) {
      console.error('Error in CashbookImportController.uploadImportFile:', error);
      return ResponseHelper.error(res, 'Failed to process import file', error.message);
    }
  }
  
  /**
   * Get import batch details
   * GET /api/cashbook/import/batch/:batchId
   */
  static async getImportBatch(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { batchId } = req.params;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const batch = await CashbookImportService.getImportBatch(batchId);
      
      if (!batch) {
        return ResponseHelper.notFound(res, 'Import batch not found.');
      }
      
      // Check if user owns this batch
      if (batch.createdById !== userId) {
        return ResponseHelper.forbidden(res, 'Access denied to this import batch.');
      }
      
      return ResponseHelper.success(res, 'Import batch retrieved successfully', batch);
      
    } catch (error: any) {
      console.error('Error in CashbookImportController.getImportBatch:', error);
      return ResponseHelper.error(res, 'Failed to get import batch', error.message);
    }
  }
  
  /**
   * List user's import batches
   * GET /api/cashbook/import/batches
   */
  static async listImportBatches(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      // Get import batches for user
      const batches = await prisma.cashbookImportBatch.findMany({
        where: { createdById: userId },
        include: {
          transactions: {
            select: {
              id: true,
              transactionDate: true,
              transactionType: true,
              totalAmount: true,
              description: true,
              status: true
            }
          },
          importErrors: {
            select: {
              rowNumber: true,
              fieldName: true,
              errorMessage: true,
              severity: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
      });
      
      return ResponseHelper.success(res, 'Import batches retrieved successfully', batches);
      
    } catch (error: any) {
      console.error('Error in CashbookImportController.listImportBatches:', error);
      return ResponseHelper.error(res, 'Failed to list import batches', error.message);
    }
  }
  
  /**
   * Download import file from Firebase Storage
   * GET /api/cashbook/import/download/:batchId
   */
  static async downloadImportFile(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { batchId } = req.params;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      // Get import batch
      const batch = await CashbookImportService.getImportBatch(batchId);
      
      if (!batch) {
        return ResponseHelper.notFound(res, 'Import batch not found.');
      }
      
      if (batch.createdById !== userId) {
        return ResponseHelper.forbidden(res, 'Access denied to this import batch.');
      }
      
      if (!batch.filePath) {
        return ResponseHelper.notFound(res, 'Import file not found.');
      }
      
      // Download file from Firebase Storage
      const fileBuffer = await FirebaseStorageService.downloadImportFile(batch.filePath);
      
      // Set response headers
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${batch.fileName}"`);
      res.setHeader('Content-Length', fileBuffer.length);
      
      // Send file
      res.send(fileBuffer);
      
    } catch (error: any) {
      console.error('Error in CashbookImportController.downloadImportFile:', error);
      return ResponseHelper.error(res, 'Failed to download import file', error.message);
    }
  }
  
  /**
   * Clean up old import files
   * DELETE /api/cashbook/import/cleanup
   */
  static async cleanupOldImports(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { daysOld = 7 } = req.body;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      // Clean up old imports
      await CashbookImportService.cleanupOldImports(userId, daysOld);
      
      return ResponseHelper.success(res, 'Old imports cleaned up successfully');
      
    } catch (error: any) {
      console.error('Error in CashbookImportController.cleanupOldImports:', error);
      return ResponseHelper.error(res, 'Failed to cleanup old imports', error.message);
    }
  }
  
  /**
   * Get import template
   * GET /api/cashbook/import/template
   */
  static async getImportTemplate(req: Request, res: Response) {
    try {
      // Create CSV template
      const template = `Date,Type,Description,Amount,Reference,Bank,ContraAccount,VATCode,Project,Customer,Supplier
2024-01-15,RECEIPT,Customer Payment,5000.00,INV-001,Main Bank,4000,15%,PROJ-001,CUST-001,
2024-01-16,PAYMENT,Rent Payment,2000.00,CHQ-001,Main Bank,5000,15%,PROJ-001,,SUPP-001
2024-01-17,RECEIPT,Interest Income,500.00,INT-001,Savings Account,4010,0%,PROJ-001,,
2024-01-18,PAYMENT,Office Supplies,300.00,SUP-001,Main Bank,5010,15%,PROJ-001,,SUPP-002`;
      
      // Set response headers
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="cashbook_import_template.csv"');
      
      // Send template
      res.send(template);
      
    } catch (error: any) {
      console.error('Error in CashbookImportController.getImportTemplate:', error);
      return ResponseHelper.error(res, 'Failed to get import template', error.message);
    }
  }
}


