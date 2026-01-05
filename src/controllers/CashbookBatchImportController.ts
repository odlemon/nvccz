// @ts-nocheck
import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import { CashbookBatchImportService } from "../services/CashbookBatchImportService";
import multer from 'multer';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

// Configure multer for file upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  }
});

export default class CashbookBatchImportController {
  
  /**
   * Import CSV file and create batch
   * POST /api/cashbook/batches/import
   */
  static async importCSV(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      if (!req.file) {
        return ResponseHelper.badRequest(res, 'CSV file is required');
      }
      
      // Validate file size
      if (req.file.size === 0) {
        return ResponseHelper.badRequest(res, 'CSV file is empty');
      }
      
      // Validate file type
      if (!req.file.mimetype.includes('csv') && !req.file.originalname.endsWith('.csv')) {
        return ResponseHelper.badRequest(res, 'File must be a CSV file');
      }
      
      const result = await CashbookBatchImportService.importCSV(
        req.file.buffer,
        req.file.originalname,
        userId
      );
      
      return ResponseHelper.success(res, 'CSV imported successfully', result);
      
    } catch (error: any) {
      console.error('❌ Error in CashbookBatchImportController.importCSV:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        stack: error.stack,
        response: error.response?.data
      });
      
      // Extract meaningful error message (already formatted by service)
      let errorMessage = error.message || 'Unknown error occurred';
      
      // Handle specific error types
      if (error.message?.includes('CSV file is empty') || error.message?.includes('empty')) {
        return ResponseHelper.badRequest(res, 'CSV file is empty', errorMessage);
      }
      
      if (error.message?.includes('No transactions found') || error.message?.includes('must have at least')) {
        return ResponseHelper.badRequest(res, 'Invalid CSV format', errorMessage);
      }
      
      if (error.message?.includes('No valid transactions')) {
        return ResponseHelper.badRequest(res, 'No valid transactions found', errorMessage);
      }
      
      if (error.message?.includes('must have a') || error.message?.includes('column')) {
        return ResponseHelper.badRequest(res, 'Invalid CSV format', errorMessage);
      }
      
      // Check for Prisma errors
      if (error.code === 'P2002') {
        return ResponseHelper.conflict(res, 'Duplicate entry detected', errorMessage);
      }
      
      if (error.code === 'P2025') {
        return ResponseHelper.notFound(res, 'Resource not found', errorMessage);
      }
      
      // Return the actual error message in the response
      return ResponseHelper.error(res, 'Failed to import CSV', errorMessage);
    }
  }
  
  /**
   * Post batch to GL
   * POST /api/cashbook/batches/:batchId/post
   */
  static async postBatch(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { batchId } = req.params;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const result = await CashbookBatchImportService.postBatch(batchId, userId);
      
      return ResponseHelper.success(res, 'Batch posted successfully', result);
      
    } catch (error: any) {
      console.error('Error in CashbookBatchImportController.postBatch:', error);
      return ResponseHelper.error(res, 'Failed to post batch', error.message);
    }
  }
  
  /**
   * Get batch details with transactions
   * GET /api/cashbook/batches/:batchId
   */
  static async getBatch(req: Request, res: Response) {
    try {
      const { batchId } = req.params;
      
      const batch = await CashbookBatchImportService.getBatchDetails(batchId);
      
      return ResponseHelper.success(res, 'Batch retrieved successfully', batch);
      
    } catch (error: any) {
      console.error('Error in CashbookBatchImportController.getBatch:', error);
      return ResponseHelper.error(res, 'Failed to get batch', error.message);
    }
  }
  
  /**
   * List all batches with pagination and filtering
   * GET /api/cashbook/batches
   */
  static async listBatches(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { page = 1, limit = 10, status } = req.query;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const result = await CashbookBatchImportService.listBatches(
        parseInt(page as string),
        parseInt(limit as string),
        status as string,
        userId
      );
      
      return ResponseHelper.success(res, 'Batches retrieved successfully', result);
      
    } catch (error: any) {
      console.error('Error in CashbookBatchImportController.listBatches:', error);
      return ResponseHelper.error(res, 'Failed to list batches', error.message);
    }
  }
  
  /**
   * Update batch details
   * PUT /api/cashbook/batches/:batchId
   */
  static async updateBatch(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { batchId } = req.params;
      const { name, description, status } = req.body;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const result = await CashbookBatchImportService.updateBatch(
        batchId,
        { name, description, status },
        userId
      );
      
      return ResponseHelper.success(res, 'Batch updated successfully', result);
      
    } catch (error: any) {
      console.error('Error in CashbookBatchImportController.updateBatch:', error);
      return ResponseHelper.error(res, 'Failed to update batch', error.message);
    }
  }
  
  /**
   * Delete batch
   * DELETE /api/cashbook/batches/:batchId
   */
  static async deleteBatch(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { batchId } = req.params;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const result = await CashbookBatchImportService.deleteBatch(batchId, userId);
      
      return ResponseHelper.success(res, 'Batch deleted successfully', result);
      
    } catch (error: any) {
      console.error('Error in CashbookBatchImportController.deleteBatch:', error);
      return ResponseHelper.error(res, 'Failed to delete batch', error.message);
    }
  }

  /**
   * Export single batch to CSV
   * GET /api/cashbook/batches/:batchId/export
   */
  static async exportBatch(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      const { batchId } = req.params;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const result = await CashbookBatchImportService.exportBatch(batchId, userId);
      
      if (!result.success) {
        return ResponseHelper.badRequest(res, result.message);
      }
      
      return ResponseHelper.success(res, result.message, result.data);
      
    } catch (error: any) {
      console.error('Error in CashbookBatchImportController.exportBatch:', error);
      return ResponseHelper.error(res, 'Failed to export batch', error.message);
    }
  }

  /**
   * Export all batches for user to CSV
   * GET /api/cashbook/batches/export/all
   */
  static async exportAllBatches(req: Request, res: Response) {
    try {
      const userId = (req as AuthRequest).user?.id;
      
      if (!userId) {
        return ResponseHelper.unauthorized(res, 'User not authenticated.');
      }
      
      const result = await CashbookBatchImportService.exportAllBatches(userId);
      
      if (!result.success) {
        return ResponseHelper.badRequest(res, result.message);
      }
      
      return ResponseHelper.success(res, result.message, result.data);
      
    } catch (error: any) {
      console.error('Error in CashbookBatchImportController.exportAllBatches:', error);
      return ResponseHelper.error(res, 'Failed to export batches', error.message);
    }
  }

  /**
   * Get CSV import template
   * GET /api/cashbook/batches/import/template
   */
  static async getTemplate(req: Request, res: Response) {
    try {
      const template = await CashbookBatchImportService.generateTemplate();
      
      // Set response headers
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="cashbook_batch_import_template.csv"');
      
      // Send template
      res.send(template);
      
    } catch (error: any) {
      console.error('Error in CashbookBatchImportController.getTemplate:', error);
      return ResponseHelper.error(res, 'Failed to get template', error.message);
    }
  }
}

// Export multer middleware for use in routes
export { upload };
