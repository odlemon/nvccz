// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceScorecardService } from "../services/PerformanceScorecardService";
import { ResponseHelper } from "../utils/responseHelper";

function buildMeta(req: Request) {
  return {
    ipAddress: (req as any).ip || req.headers["x-forwarded-for"] || req.socket?.remoteAddress || null,
    userAgent: req.headers["user-agent"] || null
  };
}

function getPeriodParams(req: Request) {
  return {
    periodStart: req.query.periodStart as string | undefined,
    periodEnd: req.query.periodEnd as string | undefined,
    periodLabel: req.query.periodLabel as string | undefined
  };
}

export class PerformanceScorecardController {
  static async getUserScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getEmployeeScorecard({
        viewer: req.user,
        employeeUserId: req.user.id,
        ...getPeriodParams(req),
        persist: false,
        meta: buildMeta(req)
      });

      return ResponseHelper.success(res, "User scorecard retrieved successfully", scorecard);
    } catch (error: any) {
      console.error("Error getting user scorecard:", error);
      const statusCode = String(error.message || "").toLowerCase().includes("access denied") ? 403 : 500;
      return ResponseHelper.error(res, error.message || "Failed to get user scorecard", undefined, statusCode);
    }
  }

  static async getEmployeeScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getEmployeeScorecard({
        viewer: req.user,
        employeeUserId: req.params.employeeId,
        ...getPeriodParams(req),
        persist: false,
        meta: buildMeta(req)
      });

      return ResponseHelper.success(res, "Employee scorecard retrieved successfully", scorecard);
    } catch (error: any) {
      console.error("Error getting employee scorecard:", error);
      const statusCode = String(error.message || "").toLowerCase().includes("access denied") ? 403 : 500;
      return ResponseHelper.error(res, error.message || "Failed to get employee scorecard", undefined, statusCode);
    }
  }

  static async generateEmployeeScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getEmployeeScorecard({
        viewer: req.user,
        employeeUserId: req.params.employeeId,
        periodStart: req.body.periodStart || req.query.periodStart,
        periodEnd: req.body.periodEnd || req.query.periodEnd,
        periodLabel: req.body.periodLabel || req.query.periodLabel,
        persist: true,
        meta: buildMeta(req)
      });

      return ResponseHelper.created(res, "Employee scorecard generated successfully", scorecard);
    } catch (error: any) {
      console.error("Error generating employee scorecard:", error);
      const statusCode = String(error.message || "").toLowerCase().includes("access denied") ? 403 : 500;
      return ResponseHelper.error(res, error.message || "Failed to generate employee scorecard", undefined, statusCode);
    }
  }

  static async getDepartmentScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getDepartmentScorecard({
        viewer: req.user,
        departmentName: req.params.department,
        ...getPeriodParams(req),
        persist: false,
        meta: buildMeta(req)
      });

      return ResponseHelper.success(res, "Department scorecard retrieved successfully", scorecard);
    } catch (error: any) {
      console.error("Error getting department scorecard:", error);
      const statusCode = String(error.message || "").toLowerCase().includes("access denied") ? 403 : 500;
      return ResponseHelper.error(res, error.message || "Failed to get department scorecard", undefined, statusCode);
    }
  }

  static async generateDepartmentScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getDepartmentScorecard({
        viewer: req.user,
        departmentName: req.params.department,
        periodStart: req.body.periodStart || req.query.periodStart,
        periodEnd: req.body.periodEnd || req.query.periodEnd,
        periodLabel: req.body.periodLabel || req.query.periodLabel,
        persist: true,
        meta: buildMeta(req)
      });

      return ResponseHelper.created(res, "Department scorecard generated successfully", scorecard);
    } catch (error: any) {
      console.error("Error generating department scorecard:", error);
      const statusCode = String(error.message || "").toLowerCase().includes("access denied") ? 403 : 500;
      return ResponseHelper.error(res, error.message || "Failed to generate department scorecard", undefined, statusCode);
    }
  }

  static async getCEOScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getCEOScorecard({
        viewer: req.user,
        ...getPeriodParams(req),
        persist: false,
        meta: buildMeta(req)
      });

      return ResponseHelper.success(res, "CEO scorecard retrieved successfully", scorecard);
    } catch (error: any) {
      console.error("Error getting CEO scorecard:", error);
      const statusCode = String(error.message || "").toLowerCase().includes("access denied") ? 403 : 500;
      return ResponseHelper.error(res, error.message || "Failed to get CEO scorecard", undefined, statusCode);
    }
  }

  static async generateCEOScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getCEOScorecard({
        viewer: req.user,
        periodStart: req.body.periodStart || req.query.periodStart,
        periodEnd: req.body.periodEnd || req.query.periodEnd,
        periodLabel: req.body.periodLabel || req.query.periodLabel,
        persist: true,
        meta: buildMeta(req)
      });

      return ResponseHelper.created(res, "CEO scorecard generated successfully", scorecard);
    } catch (error: any) {
      console.error("Error generating CEO scorecard:", error);
      const statusCode = String(error.message || "").toLowerCase().includes("access denied") ? 403 : 500;
      return ResponseHelper.error(res, error.message || "Failed to generate CEO scorecard", undefined, statusCode);
    }
  }

  static async getBoardScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getBoardScorecard({
        viewer: req.user,
        ...getPeriodParams(req),
        persist: false,
        meta: buildMeta(req)
      });

      return ResponseHelper.success(res, "Board scorecard retrieved successfully", scorecard);
    } catch (error: any) {
      console.error("Error getting Board scorecard:", error);
      const statusCode = String(error.message || "").toLowerCase().includes("access denied") ? 403 : 500;
      return ResponseHelper.error(res, error.message || "Failed to get Board scorecard", undefined, statusCode);
    }
  }

  static async generateBoardScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getBoardScorecard({
        viewer: req.user,
        periodStart: req.body.periodStart || req.query.periodStart,
        periodEnd: req.body.periodEnd || req.query.periodEnd,
        periodLabel: req.body.periodLabel || req.query.periodLabel,
        persist: true,
        meta: buildMeta(req)
      });

      return ResponseHelper.created(res, "Board scorecard generated successfully", scorecard);
    } catch (error: any) {
      console.error("Error generating Board scorecard:", error);
      const statusCode = String(error.message || "").toLowerCase().includes("access denied") ? 403 : 500;
      return ResponseHelper.error(res, error.message || "Failed to generate Board scorecard", undefined, statusCode);
    }
  }

  static async getOrgBSCDashboard(req: Request, res: Response) {
    try {
      const dashboard = await PerformanceScorecardService.getOrgBSCDashboard({
        viewer: req.user,
        ...getPeriodParams(req),
        meta: buildMeta(req)
      });

      return ResponseHelper.success(res, "Organisational BSC dashboard retrieved successfully", dashboard);
    } catch (error: any) {
      console.error("Error getting organisational BSC dashboard:", error);
      const statusCode = String(error.message || "").toLowerCase().includes("access denied") ? 403 : 500;
      return ResponseHelper.error(res, error.message || "Failed to get organisational BSC dashboard", undefined, statusCode);
    }
  }

  static async finalizeScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.finalizeScorecard({
        viewer: req.user,
        scorecardId: req.params.scorecardId,
        meta: buildMeta(req)
      });

      return ResponseHelper.success(res, "Scorecard finalised successfully", scorecard);
    } catch (error: any) {
      console.error("Error finalising scorecard:", error);
      const statusCode = String(error.message || "").toLowerCase().includes("access denied") ? 403 : 500;
      return ResponseHelper.error(res, error.message || "Failed to finalise scorecard", undefined, statusCode);
    }
  }
}
