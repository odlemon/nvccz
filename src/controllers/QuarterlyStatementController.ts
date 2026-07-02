// @ts-nocheck
import { Response, NextFunction } from "express";
import { QuarterlyStatementRequest } from "../middleware/quarterlyStatementAuth";
import { QuarterlyStatementRunService } from "../services/quarterlyStatements/QuarterlyStatementRunService";
import { QuarterlyStatementCompileService } from "../services/quarterlyStatements/QuarterlyStatementCompileService";
import { QuarterlyStatementApprovalService } from "../services/quarterlyStatements/QuarterlyStatementApprovalService";
import { QuarterlyStatementAccessService } from "../services/quarterlyStatements/QuarterlyStatementAccessService";

export class QuarterlyStatementController {
  static async listRuns(req: QuarterlyStatementRequest, res: Response, next: NextFunction) {
    try {
      const fundId = req.query.fundId as string | undefined;
      const status = req.query.status as string | undefined;
      const data = await QuarterlyStatementRunService.list({ fundId, status });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createRun(req: QuarterlyStatementRequest, res: Response, next: NextFunction) {
    try {
      QuarterlyStatementAccessService.assertCanCompile(req.user);
      const data = await QuarterlyStatementRunService.create(req.user!.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getRun(req: QuarterlyStatementRequest, res: Response, next: NextFunction) {
    try {
      const data = await QuarterlyStatementRunService.get(req.params.runId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getDashboard(req: QuarterlyStatementRequest, res: Response, next: NextFunction) {
    try {
      const data = await QuarterlyStatementRunService.getDashboard(req.params.runId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async compile(req: QuarterlyStatementRequest, res: Response, next: NextFunction) {
    try {
      const data = await QuarterlyStatementCompileService.compile(req.params.runId, req.user!.id);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listRecipients(req: QuarterlyStatementRequest, res: Response, next: NextFunction) {
    try {
      const run = await QuarterlyStatementRunService.get(req.params.runId);
      res.json({ success: true, data: run.recipients });
    } catch (e) {
      next(e);
    }
  }

  static async getPreview(req: QuarterlyStatementRequest, res: Response, next: NextFunction) {
    try {
      const data = await QuarterlyStatementCompileService.getPreview(
        req.params.runId,
        req.params.clientId
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async recompute(req: QuarterlyStatementRequest, res: Response, next: NextFunction) {
    try {
      const data = await QuarterlyStatementCompileService.recomputeRecipient(
        req.params.runId,
        req.params.clientId,
        req.user!.id
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async submitReview(req: QuarterlyStatementRequest, res: Response, next: NextFunction) {
    try {
      const data = await QuarterlyStatementApprovalService.submitReview(req.params.runId, req.user!.id);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async approve(req: QuarterlyStatementRequest, res: Response, next: NextFunction) {
    try {
      const data = await QuarterlyStatementApprovalService.approve(req.params.runId, req.user!.id);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
}
