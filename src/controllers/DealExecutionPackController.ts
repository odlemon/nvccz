// @ts-nocheck
import { Response, NextFunction } from "express";
import { DealExecutionPackAuditService } from "../services/dealExecutionPack/DealExecutionPackAuditService";
import { DealExecutionPackAccessService } from "../services/dealExecutionPack/DealExecutionPackAccessService";
import { DealExecutionPackCpService } from "../services/dealExecutionPack/DealExecutionPackCpService";
import { DealExecutionPackDocumentService } from "../services/dealExecutionPack/DealExecutionPackDocumentService";
import { DealExecutionPackExecuteService } from "../services/dealExecutionPack/DealExecutionPackExecuteService";
import { DealExecutionPackProvisionService } from "../services/dealExecutionPack/DealExecutionPackProvisionService";
import { DealExecutionPackSignatureService } from "../services/dealExecutionPack/DealExecutionPackSignatureService";
import type { DealExecutionPackRequest } from "../middleware/dealExecutionPackAuth";

export class DealExecutionPackController {
  static async list(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const fundId = req.query.fundId as string | undefined;
      if (fundId) await DealExecutionPackAccessService.assertFundAccess(req.user, fundId);
      const data = await DealExecutionPackProvisionService.list({
        fundId,
        portfolioCompanyId: req.query.portfolioCompanyId as string | undefined,
        status: req.query.status as string | undefined,
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async create(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      DealExecutionPackAccessService.assertCanEditWorkspace(req.user);
      const { fundId, portfolioCompanyId, applicationId, transactionType, baseCurrency, investmentAmount, preMoneyValuation, metadata } =
        req.body || {};
      if (!fundId || !portfolioCompanyId) {
        return res.status(400).json({ success: false, message: "fundId and portfolioCompanyId are required" });
      }
      await DealExecutionPackAccessService.assertFundAccess(req.user, fundId);
      const data = await DealExecutionPackProvisionService.provision({
        fundId,
        portfolioCompanyId,
        applicationId,
        transactionType,
        baseCurrency,
        investmentAmount,
        preMoneyValuation,
        metadata,
        createdById: req.user!.id,
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async get(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackProvisionService.getDetail(req.params.packId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async dashboard(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackExecuteService.buildDashboard(req.params.packId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listDocuments(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackDocumentService.listDocuments(req.params.packId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async uploadDocument(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) return res.status(400).json({ success: false, message: "document file required" });
      const data = await DealExecutionPackDocumentService.upload({
        packId: req.params.packId,
        slotCode: req.params.slotCode,
        file: req.file,
        userId: req.user!.id,
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async verifyDocument(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackDocumentService.verify(
        req.params.packId,
        req.params.documentId,
        req.user!.id
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async downloadDocument(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const { buffer, fileName, mimeType } = await DealExecutionPackDocumentService.download(
        req.params.packId,
        req.params.documentId,
        req.user!.id
      );
      res.setHeader("Content-Type", mimeType);
      res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (e) {
      next(e);
    }
  }

  static async listCps(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackCpService.list(req.params.packId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createCp(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackCpService.create(req.params.packId, req.body, req.user!.id);
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async updateCp(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackCpService.update(req.params.packId, req.params.cpId, req.body);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async satisfyCp(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackCpService.satisfy(req.params.packId, req.params.cpId, req.user!.id);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listSignatures(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackSignatureService.list(req.params.packId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async sign(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackSignatureService.sign(
        req.params.packId,
        req.params.signatureId,
        req.user
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async execute(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackExecuteService.execute(req.params.packId, req.user);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async audit(req: DealExecutionPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await DealExecutionPackAuditService.list(req.params.packId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
}
