// @ts-nocheck
import { Request, Response, NextFunction } from "express";
import { FundFeePolicyService } from "../services/FundFeePolicyService";
import { ManagementFeeService } from "../services/ManagementFeeService";
import { DistributionService } from "../services/DistributionService";

function parseDateOnly(raw: unknown, field: string): Date {
  if (raw == null || raw === "") throw new Error(`${field} is required`);
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${field}`);
  return d;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fund fee policy
// ─────────────────────────────────────────────────────────────────────────────
export class FundFeePolicyController {
  static async get(req: Request, res: Response) {
    try {
      const { fundId } = req.params;
      const data = await FundFeePolicyService.getByFundId(fundId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(404).json({ success: false, message: e?.message || "Not found" });
    }
  }

  static async upsert(req: Request, res: Response) {
    try {
      const { fundId } = req.params;
      const data = await FundFeePolicyService.upsert(fundId, req.body || {});
      return res.json({
        success: true,
        message: "Fund fee policy saved.",
        data,
      });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Management fees
// ─────────────────────────────────────────────────────────────────────────────
export class ManagementFeeController {
  static async accrue(req: Request, res: Response, next: NextFunction) {
    try {
      const { fundId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const {
        periodStart,
        periodEnd,
        feeBase,
        rateOverride,
        feeBaseAmountOverride,
        transactionDate,
        notes,
      } = req.body || {};

      const data = await ManagementFeeService.accrueForPeriod({
        fundId,
        periodStart: parseDateOnly(periodStart, "periodStart"),
        periodEnd: parseDateOnly(periodEnd, "periodEnd"),
        feeBase,
        rateOverride,
        feeBaseAmountOverride,
        transactionDate:
          transactionDate != null && transactionDate !== ""
            ? parseDateOnly(transactionDate, "transactionDate")
            : undefined,
        notes,
        createdById: userId,
      });

      return res.status(201).json({
        success: true,
        message: "Management fee accrued successfully.",
        data,
      });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }

  static async list(req: Request, res: Response) {
    try {
      const { fundId } = req.params;
      const data = await ManagementFeeService.list(fundId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }

  static async getOne(req: Request, res: Response) {
    try {
      const { fundId, periodId } = req.params;
      const data = await ManagementFeeService.getById(fundId, periodId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(404).json({ success: false, message: e?.message || "Not found" });
    }
  }

  static async sendInvoices(req: Request, res: Response) {
    try {
      const { fundId, periodId } = req.params;
      const data = await ManagementFeeService.sendInvoices(fundId, periodId);
      return res.json({
        success: true,
        message: "Management fee invoices sent successfully.",
        data,
      });
    } catch (e: any) {
      return res.status(400).json({
        success: false,
        message: e?.message || "Error",
        details: e?.details || undefined,
      });
    }
  }

  static async recordPayment(req: Request, res: Response) {
    try {
      const { fundId, periodId, allocationId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const b = req.body || {};
      if (b.amount == null) {
        return res.status(400).json({ success: false, message: "amount is required" });
      }
      const transactionDate =
        b.transactionDate != null && b.transactionDate !== ""
          ? parseDateOnly(b.transactionDate, "transactionDate")
          : undefined;
      const cashChartOfAccountId =
        b.cashChartOfAccountId != null && String(b.cashChartOfAccountId).trim() !== ""
          ? String(b.cashChartOfAccountId).trim()
          : undefined;

      const data = await ManagementFeeService.recordAllocationPayment({
        fundId,
        periodId,
        allocationId,
        amount: b.amount,
        createdById: userId,
        transactionDate,
        cashChartOfAccountId,
      });
      return res.json({
        success: true,
        message: "Management fee payment recorded successfully.",
        data,
      });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Distributions
// ─────────────────────────────────────────────────────────────────────────────
export class DistributionController {
  static async create(req: Request, res: Response) {
    try {
      const { fundId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const {
        distributionDate,
        source,
        grossAmount,
        sourceCompanyId,
        sourceDividendId,
        carryRateOverride,
        currencyCode,
        notes,
      } = req.body || {};

      if (source == null || String(source).trim() === "") {
        return res.status(400).json({ success: false, message: "source is required" });
      }
      if (grossAmount == null) {
        return res.status(400).json({ success: false, message: "grossAmount is required" });
      }

      const data = await DistributionService.create({
        fundId,
        distributionDate: parseDateOnly(distributionDate, "distributionDate"),
        source: String(source),
        grossAmount,
        sourceCompanyId: sourceCompanyId || null,
        sourceDividendId: sourceDividendId || null,
        carryRateOverride: carryRateOverride ?? null,
        currencyCode: currencyCode || null,
        notes: notes ?? null,
        createdById: userId,
      });
      return res.status(201).json({
        success: true,
        message: "Distribution declared successfully.",
        data,
      });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }

  static async list(req: Request, res: Response) {
    try {
      const { fundId } = req.params;
      const data = await DistributionService.list(fundId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }

  static async getOne(req: Request, res: Response) {
    try {
      const { fundId, distributionId } = req.params;
      const data = await DistributionService.getById(fundId, distributionId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(404).json({ success: false, message: e?.message || "Not found" });
    }
  }

  static async sendNotices(req: Request, res: Response) {
    try {
      const { fundId, distributionId } = req.params;
      const data = await DistributionService.sendNotices(fundId, distributionId);
      return res.json({
        success: true,
        message: "Distribution notices sent successfully.",
        data,
      });
    } catch (e: any) {
      return res.status(400).json({
        success: false,
        message: e?.message || "Error",
        details: e?.details || undefined,
      });
    }
  }

  static async recordPayout(req: Request, res: Response) {
    try {
      const { fundId, distributionId, allocationId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const b = req.body || {};
      if (b.amount == null) {
        return res.status(400).json({ success: false, message: "amount is required" });
      }
      const transactionDate =
        b.transactionDate != null && b.transactionDate !== ""
          ? parseDateOnly(b.transactionDate, "transactionDate")
          : undefined;
      const cashChartOfAccountId =
        b.cashChartOfAccountId != null && String(b.cashChartOfAccountId).trim() !== ""
          ? String(b.cashChartOfAccountId).trim()
          : undefined;

      const data = await DistributionService.recordAllocationPayment({
        fundId,
        distributionId,
        allocationId,
        amount: b.amount,
        createdById: userId,
        transactionDate,
        cashChartOfAccountId,
      });
      return res.json({
        success: true,
        message: "Distribution payout recorded successfully.",
        data,
      });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }
}
