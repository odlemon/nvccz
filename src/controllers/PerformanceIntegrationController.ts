// @ts-nocheck

import { Request, Response } from "express";
import { PerformanceIntegrationService } from "../services/PerformanceIntegrationService";
import { responseHelper } from "../utils/responseHelper";

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

export class PerformanceIntegrationController {
  static async runManualSync(req: Request, res: Response) {
    try {
      const data = await PerformanceIntegrationService.runManualSync({
        ...req.body,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Performance sync completed successfully");
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error ?? "Performance sync failed");
      return responseHelper.error(res, msg, undefined, 400);
    }
  }

  /** In-process PE portfolio IRR → same goal updates as manual sync; no internal base URL or HTTP hop. */
  static async syncPePortfolioIrr(req: Request, res: Response) {
    try {
      const { goalId, kpiId, fundId } = req.body || {};
      const data = await PerformanceIntegrationService.runPePortfolioIrrSync({
        goalId,
        kpiId,
        fundId,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Portfolio IRR synced from PE module successfully");
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error ?? "Portfolio IRR sync failed");
      return responseHelper.error(res, msg, undefined, 400);
    }
  }

  // NOTE: AUM sync is now automatic on Asset/Fund mutations; endpoint removed.

  /** In-process sum of portfolio companies' reported TOTAL_REVENUE → revenue KPI goals. */
  static async syncPePortfolioTotalRevenue(req: Request, res: Response) {
    try {
      const { goalId, kpiId, fundId } = req.body || {};
      const data = await PerformanceIntegrationService.runPePortfolioTotalRevenueSync({
        goalId,
        kpiId,
        fundId,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Portfolio total revenue synced successfully");
    } catch (error: any) {
      const msg =
        error instanceof Error ? error.message : String(error ?? "Portfolio total revenue sync failed");
      return responseHelper.error(res, msg, undefined, 400);
    }
  }

  /** Payroll Employee headcount (active vs inactive) → turnover rate % on the goal. */
  static async syncPayrollTurnoverRate(req: Request, res: Response) {
    try {
      const { goalId, kpiId } = req.body || {};
      const data = await PerformanceIntegrationService.runPayrollTurnoverRateSync({
        goalId,
        kpiId,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Payroll employee turnover rate synced successfully");
    } catch (error: any) {
      const msg =
        error instanceof Error ? error.message : String(error ?? "Payroll turnover rate sync failed");
      return responseHelper.error(res, msg, undefined, 400);
    }
  }

  static async listSyncJobs(req: Request, res: Response) {
    try {
      const data = await PerformanceIntegrationService.listSyncJobs({
        goalId: req.query.goalId as string,
        status: req.query.status as string
      });
      return responseHelper.success(res, data, "Performance sync jobs retrieved successfully");
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error ?? "Unknown error");
      return responseHelper.error(res, msg, undefined, 400);
    }
  }

  static async approvePendingSync(req: Request, res: Response) {
    try {
      const data = await PerformanceIntegrationService.approvePendingSync({
        goalId: req.body.goalId,
        approvedValue: req.body.approvedValue,
        comment: req.body.comment,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Pending KPI value approved successfully");
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error ?? "Unknown error");
      return responseHelper.error(res, msg, undefined, 400);
    }
  }

  static async overrideAutomatedGoal(req: Request, res: Response) {
    try {
      const data = await PerformanceIntegrationService.overrideAutomatedGoal({
        goalId: req.body.goalId,
        value: req.body.value,
        comment: req.body.comment,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Automated KPI value overridden successfully");
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error ?? "Unknown error");
      return responseHelper.error(res, msg, undefined, 400);
    }
  }

  static async importGoalTargets(req: Request, res: Response) {
    try {
      if (!req.file?.buffer) {
        return responseHelper.error(res, "A CSV or XLSX file is required.");
      }

      const data = await PerformanceIntegrationService.importGoalTargets({
        fileBuffer: req.file.buffer,
        filename: req.file.originalname,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Goal targets imported successfully");
    } catch (error: any) {
      const msg = error instanceof Error ? error.message : String(error ?? "Unknown error");
      return responseHelper.error(res, msg, undefined, 400);
    }
  }
}
