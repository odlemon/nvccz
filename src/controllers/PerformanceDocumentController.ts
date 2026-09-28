
import { Request, Response } from "express";
import { PerformanceDocumentService } from "../services/PerformanceDocumentService";
import { responseHelper } from "../utils/responseHelper";
import { perfActor, documentWhere } from "../services/PerformanceScope";

/**
 * Performance Document Vault. Mirrors AccountingDocumentController (list + multipart upload)
 * and extends it with the vault's folder bar, detail read, metadata patch and delete.
 *
 * Response envelope follows the performance-module convention (`responseHelper`).
 */

const NOT_FOUND_MESSAGE = "Performance document not found.";

/** Validation failures surface as 400, missing rows as 404, everything else as 500. */
function statusForError(message: string): number {
  const msg = String(message || "");
  if (msg === NOT_FOUND_MESSAGE) return 404;
  if (
    msg.includes("is required") ||
    msg.includes("must be") ||
    msg.includes("must reference") ||
    msg.includes("No file uploaded")
  ) {
    return 400;
  }
  return 500;
}

function fail(res: Response, error: any) {
  const message = error?.message || "Unexpected error";
  return responseHelper.error(res, message, undefined, statusForError(message));
}

export class PerformanceDocumentController {
  /** GET /api/performance/documents */
  static async list(req: Request, res: Response) {
    try {
      const data = await PerformanceDocumentService.listPerformanceDocuments({
        folder: req.query.folder as string,
        status: req.query.status as string,
        ownerId: req.query.ownerId as string,
        departmentId: req.query.departmentId as string,
        category: req.query.category as string,
        search: req.query.search as string,
      }, documentWhere(await perfActor((req as any).user)));
      return responseHelper.success(res, data, "Performance documents retrieved successfully");
    } catch (error: any) {
      return fail(res, error);
    }
  }

  /** GET /api/performance/documents/folders */
  static async folders(_req: Request, res: Response) {
    try {
      const data = await PerformanceDocumentService.listFolders();
      return responseHelper.success(
        res,
        data,
        "Performance document folders retrieved successfully"
      );
    } catch (error: any) {
      return fail(res, error);
    }
  }

  /** GET /api/performance/documents/:id */
  static async getById(req: Request, res: Response) {
    try {
      const data = await PerformanceDocumentService.getPerformanceDocumentById(req.params.id);
      return responseHelper.success(res, data, "Performance document retrieved successfully");
    } catch (error: any) {
      return fail(res, error);
    }
  }

  /** POST /api/performance/documents (multipart/form-data, field name `file`) */
  static async upload(req: Request, res: Response) {
    try {
      const file = (req as any).file;
      if (!file) {
        return responseHelper.error(res, "No file uploaded.", undefined, 400);
      }

      const data = await PerformanceDocumentService.uploadPerformanceDocument({
        fileBuffer: file.buffer,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSizeBytes: file.size,
        name: req.body.name,
        folder: req.body.folder,
        category: req.body.category,
        version: req.body.version,
        status: req.body.status,
        ownerId: req.body.ownerId,
        departmentId: req.body.departmentId,
        retentionUntil: req.body.retentionUntil,
        uploadedById: (req as any).user?.id,
      });

      return responseHelper.success(res, data, "Document uploaded successfully", 201);
    } catch (error: any) {
      return fail(res, error);
    }
  }

  /** PATCH /api/performance/documents/:id */
  static async update(req: Request, res: Response) {
    try {
      const data = await PerformanceDocumentService.updatePerformanceDocument(req.params.id, {
        name: req.body.name,
        folder: req.body.folder,
        category: req.body.category,
        version: req.body.version,
        status: req.body.status,
        ownerId: req.body.ownerId,
        departmentId: req.body.departmentId,
        retentionUntil: req.body.retentionUntil,
      });
      return responseHelper.success(res, data, "Performance document updated successfully");
    } catch (error: any) {
      return fail(res, error);
    }
  }

  /** DELETE /api/performance/documents/:id */
  static async remove(req: Request, res: Response) {
    try {
      const data = await PerformanceDocumentService.deletePerformanceDocument(req.params.id);
      return responseHelper.success(res, data, "Performance document deleted successfully");
    } catch (error: any) {
      return fail(res, error);
    }
  }
}

export default PerformanceDocumentController;
