// @ts-nocheck
import { Response, NextFunction } from "express";
import { CapTableRequest } from "../middleware/capTableAuth";
import { CapTableBalanceService } from "../services/capTable/CapTableBalanceService";
import { CapTableConvertibleService } from "../services/capTable/CapTableConvertibleService";
import { CapTableDilutionEngine } from "../services/capTable/CapTableDilutionEngine";
import { CapTableRegistryService } from "../services/capTable/CapTableRegistryService";
import { CapTableShareClassService } from "../services/capTable/CapTableShareClassService";
import { CapTableStakeholderService } from "../services/capTable/CapTableStakeholderService";
import { CapTableCertificateService } from "../services/capTable/CapTableCertificateService";
import { CapTableTransactionExecutionService } from "../services/capTable/CapTableTransactionExecutionService";
import { CapTableTransactionService } from "../services/capTable/CapTableTransactionService";
import { CapTableTransactionWorkflowService } from "../services/capTable/CapTableTransactionWorkflowService";
import { CapTableWaterfallEngine } from "../services/capTable/CapTableWaterfallEngine";

export class CapTableController {
  static async listRegistries(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const fundId = req.query.fundId as string | undefined;
      const data = await CapTableRegistryService.list({ fundId });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async bootstrapRegistry(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const { portfolioCompanyId, baseCurrencyCode } = req.body;
      const data = await CapTableRegistryService.bootstrap(portfolioCompanyId, baseCurrencyCode);
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getRegistry(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableRegistryService.getByPortfolioCompanyId(req.params.portfolioCompanyId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listShareClasses(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableShareClassService.list(req.params.portfolioCompanyId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createShareClass(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableShareClassService.create(req.params.portfolioCompanyId, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async patchShareClass(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableShareClassService.update(
        req.params.portfolioCompanyId,
        req.params.shareClassId,
        req.body
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listStakeholders(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableStakeholderService.list(req.params.portfolioCompanyId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createStakeholder(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableStakeholderService.create(req.params.portfolioCompanyId, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async patchStakeholder(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableStakeholderService.update(
        req.params.portfolioCompanyId,
        req.params.stakeholderId,
        req.body
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listConvertibles(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableConvertibleService.list(req.params.portfolioCompanyId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createConvertible(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableConvertibleService.create(req.params.portfolioCompanyId, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async listTransactions(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableTransactionService.list(req.params.portfolioCompanyId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createIssuance(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableTransactionService.createIssuance(
        req.params.portfolioCompanyId,
        req.user!.id,
        req.body
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async createTransfer(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableTransactionService.createTransfer(
        req.params.portfolioCompanyId,
        req.user!.id,
        req.body
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async submitTransaction(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableTransactionWorkflowService.submit(
        req.params.portfolioCompanyId,
        req.params.transactionId
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async approveTransaction(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableTransactionWorkflowService.approve(
        req.params.portfolioCompanyId,
        req.params.transactionId,
        req.user!.id
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async rejectTransaction(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableTransactionWorkflowService.reject(
        req.params.portfolioCompanyId,
        req.params.transactionId,
        req.body?.notes
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async executeTransaction(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableTransactionExecutionService.execute(
        req.params.portfolioCompanyId,
        req.params.transactionId,
        req.user!.id
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async getRegister(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const registry = await CapTableRegistryService.getByPortfolioCompanyId(req.params.portfolioCompanyId);
      const register = await CapTableBalanceService.issuedByClass(registry.id);
      res.json({
        success: true,
        data: {
          registry,
          ...register,
        },
      });
    } catch (e) {
      next(e);
    }
  }

  static async runSimulator(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const registry = await CapTableRegistryService.getByPortfolioCompanyId(req.params.portfolioCompanyId);
      const balances = await CapTableBalanceService.issuedByClass(registry.id);
      const result = CapTableDilutionEngine.run({
        ...req.body,
        preMoneyFullyDilutedShares: req.body.preMoneyFullyDilutedShares ?? balances.fullyDilutedShareCount,
      });
      res.json({ success: true, data: result });
    } catch (e) {
      next(e);
    }
  }

  static async evaluateWaterfall(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const { totalProceeds, classes } = req.body;
      const data = CapTableWaterfallEngine.evaluate(totalProceeds, classes);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async downloadCertificate(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const buf = await CapTableCertificateService.getCertificateBuffer(
        req.params.portfolioCompanyId,
        req.params.transactionId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="stock-certificate-${req.params.transactionId.slice(0, 8)}.pdf"`
      );
      res.send(buf);
    } catch (e) {
      next(e);
    }
  }

  static async verifyCertificate(req: CapTableRequest, res: Response, next: NextFunction) {
    try {
      const data = await CapTableCertificateService.verify(
        req.params.portfolioCompanyId,
        req.params.transactionId
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
}
