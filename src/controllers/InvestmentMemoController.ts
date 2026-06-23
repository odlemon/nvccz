// @ts-nocheck
import { Response, NextFunction } from "express";
import type { InvestmentMemoRequest } from "../middleware/investmentMemoAuth";
import { InvestmentMemoVersionService } from "../services/investmentMemo/InvestmentMemoVersionService";
import { InvestmentMemoWorkflowService } from "../services/investmentMemo/InvestmentMemoWorkflowService";
import { InvestmentMemoApprovalHistoryService } from "../services/investmentMemo/InvestmentMemoApprovalHistoryService";
import { InvestmentMemoValidationService } from "../services/investmentMemo/InvestmentMemoValidationService";
import { InvestmentMemoProvisionService } from "../services/investmentMemo/InvestmentMemoProvisionService";

export class InvestmentMemoController {
  static async getMemo(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const data = await InvestmentMemoVersionService.getMemoHeader(
        req.params.applicationId,
        req.user!.id
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listVersions(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const data = await InvestmentMemoVersionService.listVersions(req.params.applicationId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getVersion(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const data = await InvestmentMemoVersionService.getVersion(
        req.params.applicationId,
        req.params.versionId
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createVersion(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const data = await InvestmentMemoVersionService.createNewVersion(
        req.params.applicationId,
        req.user!.id,
        req.body?.changeSummary
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async saveDraft(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const validate = String(req.query.validate || "").toLowerCase() === "true";
      const data = await InvestmentMemoVersionService.saveDraft(
        req.params.applicationId,
        req.params.versionId,
        req.body?.sections || {},
        { validate, changeSummary: req.body?.changeSummary }
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async validateVersion(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const version = await InvestmentMemoVersionService.getVersion(
        req.params.applicationId,
        req.params.versionId
      );
      const validation = InvestmentMemoValidationService.validateSections(version.sections as any);
      res.json({ success: true, data: validation });
    } catch (e) {
      next(e);
    }
  }

  static async submit(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const data = await InvestmentMemoWorkflowService.submit(
        req.params.applicationId,
        req.params.versionId,
        req.user!.id
      );
      res.json({ success: true, data });
    } catch (e: any) {
      if (e.statusCode === 400 && e.validation) {
        return res.status(400).json({ success: false, message: e.message, validation: e.validation });
      }
      next(e);
    }
  }

  static async approve(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const data = await InvestmentMemoWorkflowService.approve(
        req.params.applicationId,
        req.params.versionId,
        req.user!.id,
        req.body?.comment
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async reject(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const data = await InvestmentMemoWorkflowService.reject(
        req.params.applicationId,
        req.params.versionId,
        req.user!.id,
        req.body?.comment
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async uploadAttachment(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const file = (req as any).file;
      if (!file?.buffer?.length) {
        return res.status(400).json({ success: false, message: "file is required (multipart field `file`)" });
      }
      const data = await InvestmentMemoVersionService.attachFile(
        req.params.applicationId,
        req.params.versionId,
        { buffer: file.buffer, originalname: file.originalname },
        req.user!.id
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async approvalHistory(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const data = await InvestmentMemoApprovalHistoryService.listForApplication(
        req.params.applicationId
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async provision(req: InvestmentMemoRequest, res: Response, next: NextFunction) {
    try {
      const data = await InvestmentMemoProvisionService.ensureMemoForApplication(
        req.params.applicationId,
        req.user!.id
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
}
