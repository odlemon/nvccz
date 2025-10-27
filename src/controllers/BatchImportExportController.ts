// @ts-nocheck
// Batch Import/Export Controller
// Handles batch import and export endpoints

import { Request, Response } from "express";
import { ResponseHelper } from "../utils/responseHelper";
import BatchImportExportService from "../services/BatchImportExportService";
import multer from "multer";
import { prisma } from "../utils/database";

interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roleId: string;
  };
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

export default class BatchImportExportController {
  
  /**
   * Import batch from CSV file
   * POST /api/cashbook/batches/import
   */
  static async importBatch(req: AuthRequest, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json(
          ResponseHelper.error('No file uploaded')
        );
      }

      if (!req.user?.id) {
        return res.status(401).json(
          ResponseHelper.error('User authentication required')
        );
      }

      const { mapping } = req.body;
      let parsedMapping;
      
      try {
        parsedMapping = typeof mapping === 'string' ? JSON.parse(mapping) : mapping;
      } catch (error) {
        return res.status(400).json(
          ResponseHelper.error('Invalid mapping format')
        );
      }

      const result = await BatchImportExportService.importBatch({
        file: req.file,
        mapping: parsedMapping,
        createdById: req.user.id
      });

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in importBatch:', error);
      return res.status(500).json(
        ResponseHelper.error('Internal server error')
      );
    }
  }

  /**
   * Export batch to CSV/JSON
   * GET /api/cashbook/batches/:batchId/export
   */
  static async exportBatch(req: AuthRequest, res: Response) {
    try {
      const { batchId } = req.params;
      const { format = 'CSV' } = req.query;

      if (!batchId) {
        return res.status(400).json(
          ResponseHelper.error('Missing required parameter: batchId')
        );
      }

      if (!['CSV', 'JSON'].includes(format as string)) {
        return res.status(400).json(
          ResponseHelper.error('Invalid format. Must be CSV or JSON')
        );
      }

      const result = await BatchImportExportService.exportBatch(
        batchId,
        format as 'CSV' | 'JSON'
      );

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in exportBatch:', error);
      return res.status(500).json(
        ResponseHelper.error('Internal server error')
      );
    }
  }

  /**
   * Get import status
   * GET /api/cashbook/batches/import/:batchId/status
   */
  static async getImportStatus(req: AuthRequest, res: Response) {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json(
          ResponseHelper.error('Missing required parameter: batchId')
        );
      }

      const result = await BatchImportExportService.getImportStatus(batchId);

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in getImportStatus:', error);
      return res.status(500).json(
        ResponseHelper.error('Internal server error')
      );
    }
  }

  /**
   * Get export history
   * GET /api/cashbook/batches/:batchId/exports
   */
  static async getExportHistory(req: AuthRequest, res: Response) {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json(
          ResponseHelper.error('Missing required parameter: batchId')
        );
      }

      const result = await BatchImportExportService.getExportHistory(batchId);

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in getExportHistory:', error);
      return res.status(500).json(
        ResponseHelper.error('Internal server error')
      );
    }
  }

  /**
   * Delete unposted batch
   * DELETE /api/cashbook/batches/:batchId
   */
  static async deleteBatch(req: AuthRequest, res: Response) {
    try {
      const { batchId } = req.params;

      if (!batchId) {
        return res.status(400).json(
          ResponseHelper.error('Missing required parameter: batchId')
        );
      }

      if (!req.user?.id) {
        return res.status(401).json(
          ResponseHelper.error('User authentication required')
        );
      }

      const result = await BatchImportExportService.deleteUnpostedBatch(
        batchId,
        req.user.id
      );

      if (result.success) {
        return res.status(200).json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (error) {
      console.error('Error in deleteBatch:', error);
      return res.status(500).json(
        ResponseHelper.error('Internal server error')
      );
    }
  }

  /**
   * Download exported file
   * GET /api/cashbook/batches/:batchId/export/:exportId/download
   */
  static async downloadExport(req: AuthRequest, res: Response) {
    try {
      const { batchId, exportId } = req.params;

      if (!batchId || !exportId) {
        return res.status(400).json(
          ResponseHelper.error('Missing required parameters')
        );
      }

      // Get export record
      const exportRecord = await prisma.cashbookExport.findUnique({
        where: { id: exportId }
      });

      if (!exportRecord) {
        return res.status(404).json(
          ResponseHelper.error('Export not found')
        );
      }

      // Check if export is expired
      const expiresAt = new Date(exportRecord.exportedAt.getTime() + 24 * 60 * 60 * 1000);
      if (new Date() > expiresAt) {
        return res.status(410).json(
          ResponseHelper.error('Export has expired')
        );
      }

      // Generate file content (this would typically be stored in cloud storage)
      // For now, we'll return a placeholder
      return res.status(200).json({
        success: true,
        message: 'Download URL generated',
        data: {
          downloadUrl: `/api/cashbook/batches/${batchId}/export/${exportId}/file`,
          expiresAt: expiresAt
        }
      });
    } catch (error) {
      console.error('Error in downloadExport:', error);
      return res.status(500).json(
        ResponseHelper.error('Internal server error')
      );
    }
  }
}
