// @ts-nocheck
import { Response, NextFunction } from "express";
import { TaxReturnPackAccessService } from "../services/taxReturnPack/TaxReturnPackAccessService";
import { TaxReturnPackApprovalService } from "../services/taxReturnPack/TaxReturnPackApprovalService";
import { TaxReturnPackAuditService } from "../services/taxReturnPack/TaxReturnPackAuditService";
import { TaxReturnPackCompileService } from "../services/taxReturnPack/TaxReturnPackCompileService";
import { TaxReturnPackDashboardService } from "../services/taxReturnPack/TaxReturnPackDashboardService";
import { TaxReturnPackProvisionService } from "../services/taxReturnPack/TaxReturnPackProvisionService";
import { TaxReturnPackReconciliationService } from "../services/taxReturnPack/TaxReturnPackReconciliationService";
import type { TaxReturnPackRequest } from "../middleware/taxReturnPackAuth";
import { prisma } from "../utils/database";

export class TaxReturnPackController {
  static async list(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      const fundId = req.query.fundId as string | undefined;
      if (fundId) await TaxReturnPackAccessService.assertCanView(req.user, fundId);
      const data = await TaxReturnPackProvisionService.list({
        forecastEntityId: req.query.forecastEntityId as string | undefined,
        fundId,
        taxYear: req.query.taxYear ? Number(req.query.taxYear) : undefined,
        status: req.query.status as string | undefined,
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async create(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      TaxReturnPackAccessService.assertCanCompile(req.user);
      const { forecastEntityId, taxYear, taxPeriod, taxRegime, baseCurrency, fundId } = req.body || {};
      if (!forecastEntityId || !taxYear) {
        return res.status(400).json({ success: false, message: "forecastEntityId and taxYear are required" });
      }
      if (fundId) await TaxReturnPackAccessService.assertCanView(req.user, fundId);
      const data = await TaxReturnPackProvisionService.provision({
        forecastEntityId,
        taxYear: Number(taxYear),
        taxPeriod,
        taxRegime,
        baseCurrency,
        fundId,
        createdById: req.user!.id,
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async get(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await TaxReturnPackProvisionService.getDetail(req.params.packId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async dashboard(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await TaxReturnPackDashboardService.build(req.params.packId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async compile(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await TaxReturnPackCompileService.compile(req.params.packId, req.user!.id);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async reconciliation(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await TaxReturnPackReconciliationService.list(req.params.packId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async patchReconciliationLine(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      const { taxCategory, reason } = req.body || {};
      if (!taxCategory) {
        return res.status(400).json({ success: false, message: "taxCategory is required" });
      }
      const data = await TaxReturnPackReconciliationService.overrideLine(
        req.params.packId,
        req.params.lineId,
        req.user!.id,
        { taxCategory, reason }
      );
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async cgt(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await prisma.taxReturnPackCgtLine.findMany({
        where: { packId: req.params.packId },
        orderBy: { createdAt: "asc" },
      });
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async submitReview(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await TaxReturnPackApprovalService.submitReview(req.params.packId, req.user!.id);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async signOff(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await TaxReturnPackApprovalService.signOff(req.params.packId, req.user!.id);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }

  static async pdf(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      const pack = await TaxReturnPackProvisionService.getDetail(req.params.packId);
      if (!pack.packPdfUrl) {
        return res.status(404).json({ success: false, message: "PDF not generated yet" });
      }
      if (pack.packPdfSha256 && pack.packPdfStoragePath) {
        res.setHeader("X-Pack-SHA256", pack.packPdfSha256);
      }
      res.redirect(pack.packPdfUrl);
    } catch (e) {
      next(e);
    }
  }

  static async audit(req: TaxReturnPackRequest, res: Response, next: NextFunction) {
    try {
      const data = await TaxReturnPackAuditService.list(req.params.packId);
      res.json({ success: true, data });
    } catch (e) {
      next(e);
    }
  }
}
