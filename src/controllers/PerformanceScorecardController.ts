// @ts-nocheck
import { Request, Response } from "express";
import {
  BOARD_CONTRACT_NOT_FOUND_MESSAGE,
  CEO_CONTRACT_NOT_FOUND_MESSAGE,
  PerformanceScorecardService
} from "../services/PerformanceScorecardService";
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

/**
 * For POST generate routes: merge JSON body with query. Safe when `req.body` is undefined
 * (no body, wrong Content-Type, or body-parser skipped) — avoids reading `.periodStart` off undefined.
 */
function getPeriodParamsFromBodyOrQuery(req: Request) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const q = req.query || {};
  return {
    periodStart: (body.periodStart as string | undefined) || (q.periodStart as string | undefined),
    periodEnd: (body.periodEnd as string | undefined) || (q.periodEnd as string | undefined),
    periodLabel: (body.periodLabel as string | undefined) || (q.periodLabel as string | undefined)
  };
}

/** CEO/Board contract scorecard: `redistribute` (default) vs legacy `penalise` section blend. */
function parseSectionBlendMode(req: Request, mergeBody: boolean): "penalise" | "redistribute" {
  const body = mergeBody && req.body && typeof req.body === "object" ? req.body : {};
  const q = req.query || {};
  const raw =
    (body.sectionBlendMode as string | undefined) || (q.sectionBlendMode as string | undefined);
  const v = String(raw ?? "redistribute").trim().toLowerCase();
  if (v === "penalise" || v === "penalty" || v === "penalize") return "penalise";
  return "redistribute";
}

function statusForEmployeeScorecardError(message: string): number {
  const m = String(message || "").toLowerCase();
  if (m.includes("access denied")) return 403;
  if (m.includes("employee not found")) return 404;
  if (m.includes("no active performance contract")) return 404;
  if (
    m.includes("goal weights do not sum") ||
    m.includes("no scoreable goals") ||
    m.includes("no performance data recorded")
  ) {
    return 400;
  }
  return 500;
}

/** Query/body `departmentId` overrides path department name when present (v2). */
function getDepartmentTargetFromRequest(req: Request, pathDepartment?: string) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const q = req.query || {};
  const departmentId = String(
    (body.departmentId as string | undefined) || (q.departmentId as string | undefined) || ""
  ).trim();
  if (departmentId) {
    return { departmentId, departmentName: undefined as string | undefined };
  }
  const name =
    pathDepartment !== undefined && pathDepartment !== null && String(pathDepartment).length > 0
      ? decodeURIComponent(String(pathDepartment)).trim()
      : undefined;
  return { departmentId: undefined as string | undefined, departmentName: name };
}

function statusForDepartmentScorecardError(message: string): number {
  const m = String(message || "").toLowerCase();
  if (m.includes("access denied")) return 403;
  if (m.includes("department not found")) return 404;
  if (m.includes("no active performance contract")) return 404;
  if (
    m.includes("no scoreable goals") ||
    m.includes("departmentid or department name is required") ||
    m.includes("a finalised scorecard already exists")
  ) {
    return 400;
  }
  return 500;
}

function statusForDepartmentQualitativeEvaluationError(message: string): number {
  const m = String(message || "").toLowerCase();
  if (m.includes("access denied")) return 403;
  if (m.includes("department not found")) return 404;
  if (m.includes("no active performance contract")) return 404;
  if (m.includes("a finalised scorecard already exists")) return 409;
  if (
    m.includes("qualitativeevaluation") ||
    m.includes("personal attribute") ||
    m.includes("invalid rating column") ||
    m.includes("departmentid or department name is required")
  ) {
    return 400;
  }
  return 500;
}

function getQualitativeEvaluationFromBody(req: Request) {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const qe = body.qualitativeEvaluation;
  if (!qe || typeof qe !== "object") {
    throw new Error("qualitativeEvaluation is required in the request body.");
  }
  return {
    personalAttributes: qe.personalAttributes,
    trainingAndDevelopment: qe.trainingAndDevelopment
  };
}

function statusForCEOScorecardError(message: string): number {
  const m = String(message || "").toLowerCase();
  if (m.includes("access denied")) return 403;
  if (m.includes("no ceo performance contract found") || m.includes("no active ceo performance contract")) {
    return 404;
  }
  if (
    m.includes("cannot save ceo scorecard: no indicators") ||
    m.includes("a finalised ceo scorecard already exists") ||
    m.includes("no subject user") ||
    m.includes("cannot persist scorecard")
  ) {
    return 400;
  }
  return 500;
}

export class PerformanceScorecardController {
  /**
   * Employees with an EMPLOYEE performance contract for the period (excludes CEO).
   * Query: periodStart, periodEnd, periodLabel — same as other scorecard routes.
   */
  static async listEmployeesForScorecardGeneration(req: Request, res: Response) {
    try {
      const data = await PerformanceScorecardService.listEmployeesWithContractForScorecardPeriod(
        getPeriodParams(req)
      );
      return ResponseHelper.success(
        res,
        "Employees with a performance contract for this period (CEO excluded)",
        data
      );
    } catch (error: any) {
      console.error("Error listing employees for scorecard:", error);
      return ResponseHelper.error(
        res,
        error.message || "Failed to list employees",
        undefined,
        500
      );
    }
  }

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
      const statusCode = statusForEmployeeScorecardError(error.message);
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
      const statusCode = statusForEmployeeScorecardError(error.message);
      return ResponseHelper.error(res, error.message || "Failed to get employee scorecard", undefined, statusCode);
    }
  }

  static async generateEmployeeScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getEmployeeScorecard({
        viewer: req.user,
        employeeUserId: req.params.employeeId,
        ...getPeriodParamsFromBodyOrQuery(req),
        persist: true,
        meta: buildMeta(req)
      });

      return ResponseHelper.created(res, "Employee scorecard generated successfully", scorecard);
    } catch (error: any) {
      console.error("Error generating employee scorecard:", error);
      const statusCode = statusForEmployeeScorecardError(error.message);
      return ResponseHelper.error(res, error.message || "Failed to generate employee scorecard", undefined, statusCode);
    }
  }

  static async getDepartmentScorecard(req: Request, res: Response) {
    try {
      const { departmentId, departmentName } = getDepartmentTargetFromRequest(req, req.params.department);
      const scorecard = await PerformanceScorecardService.getDepartmentScorecard({
        viewer: req.user,
        departmentId,
        departmentName,
        ...getPeriodParams(req),
        persist: false,
        meta: buildMeta(req)
      });

      return ResponseHelper.success(res, "Department scorecard retrieved successfully", scorecard);
    } catch (error: any) {
      console.error("Error getting department scorecard:", error);
      const statusCode = statusForDepartmentScorecardError(error.message);
      return ResponseHelper.error(res, error.message || "Failed to get department scorecard", undefined, statusCode);
    }
  }

  static async generateDepartmentScorecard(req: Request, res: Response) {
    try {
      const { departmentId, departmentName } = getDepartmentTargetFromRequest(req, req.params.department);
      const scorecard = await PerformanceScorecardService.getDepartmentScorecard({
        viewer: req.user,
        departmentId,
        departmentName,
        ...getPeriodParamsFromBodyOrQuery(req),
        persist: true,
        meta: buildMeta(req)
      });

      return ResponseHelper.created(res, "Department scorecard generated successfully", scorecard);
    } catch (error: any) {
      console.error("Error generating department scorecard:", error);
      const statusCode = statusForDepartmentScorecardError(error.message);
      return ResponseHelper.error(res, error.message || "Failed to generate department scorecard", undefined, statusCode);
    }
  }

  static async getDepartmentScorecardById(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getDepartmentScorecard({
        viewer: req.user,
        departmentId: req.params.departmentId,
        ...getPeriodParams(req),
        persist: false,
        meta: buildMeta(req)
      });

      return ResponseHelper.success(res, "Department scorecard retrieved successfully", scorecard);
    } catch (error: any) {
      console.error("Error getting department scorecard by id:", error);
      const statusCode = statusForDepartmentScorecardError(error.message);
      return ResponseHelper.error(res, error.message || "Failed to get department scorecard", undefined, statusCode);
    }
  }

  static async generateDepartmentScorecardById(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getDepartmentScorecard({
        viewer: req.user,
        departmentId: req.params.departmentId,
        ...getPeriodParamsFromBodyOrQuery(req),
        persist: true,
        meta: buildMeta(req)
      });

      return ResponseHelper.created(res, "Department scorecard generated successfully", scorecard);
    } catch (error: any) {
      console.error("Error generating department scorecard by id:", error);
      const statusCode = statusForDepartmentScorecardError(error.message);
      return ResponseHelper.error(res, error.message || "Failed to generate department scorecard", undefined, statusCode);
    }
  }

  static async putDepartmentQualitativeEvaluation(req: Request, res: Response) {
    try {
      const { departmentId, departmentName } = getDepartmentTargetFromRequest(req, req.params.department);
      const qualitativeEvaluation = getQualitativeEvaluationFromBody(req);
      const data = await PerformanceScorecardService.saveDepartmentQualitativeEvaluation({
        viewer: req.user,
        departmentId,
        departmentName,
        ...getPeriodParamsFromBodyOrQuery(req),
        qualitativeEvaluation,
        meta: buildMeta(req)
      });

      return ResponseHelper.success(
        res,
        "Department Head qualitative evaluation saved",
        data
      );
    } catch (error: any) {
      console.error("Error saving department qualitative evaluation:", error);
      const statusCode = statusForDepartmentQualitativeEvaluationError(error.message);
      return ResponseHelper.error(
        res,
        error.message || "Failed to save department qualitative evaluation",
        undefined,
        statusCode
      );
    }
  }

  static async putDepartmentQualitativeEvaluationById(req: Request, res: Response) {
    try {
      const qualitativeEvaluation = getQualitativeEvaluationFromBody(req);
      const data = await PerformanceScorecardService.saveDepartmentQualitativeEvaluation({
        viewer: req.user,
        departmentId: req.params.departmentId,
        ...getPeriodParamsFromBodyOrQuery(req),
        qualitativeEvaluation,
        meta: buildMeta(req)
      });

      return ResponseHelper.success(
        res,
        "Department Head qualitative evaluation saved",
        data
      );
    } catch (error: any) {
      console.error("Error saving department qualitative evaluation by id:", error);
      const statusCode = statusForDepartmentQualitativeEvaluationError(error.message);
      return ResponseHelper.error(
        res,
        error.message || "Failed to save department qualitative evaluation",
        undefined,
        statusCode
      );
    }
  }

  static async getCEOScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getCEOScorecard({
        viewer: req.user,
        ...getPeriodParams(req),
        persist: false,
        meta: buildMeta(req),
        sectionBlendMode: parseSectionBlendMode(req, false)
      });

      return ResponseHelper.success(res, "CEO scorecard retrieved successfully", scorecard);
    } catch (error: any) {
      console.error("Error getting CEO scorecard:", error);
      const msg = error.message || "";
      if (msg === CEO_CONTRACT_NOT_FOUND_MESSAGE) {
        return ResponseHelper.error(res, msg, "CEO_CONTRACT_NOT_FOUND", 404);
      }
      const statusCode = statusForCEOScorecardError(msg);
      return ResponseHelper.error(res, msg || "Failed to get CEO scorecard", undefined, statusCode);
    }
  }

  static async generateCEOScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getCEOScorecard({
        viewer: req.user,
        ...getPeriodParamsFromBodyOrQuery(req),
        persist: true,
        meta: buildMeta(req),
        sectionBlendMode: parseSectionBlendMode(req, true)
      });

      return ResponseHelper.created(res, "CEO scorecard generated successfully", scorecard);
    } catch (error: any) {
      console.error("Error generating CEO scorecard:", error);
      const msg = error.message || "";
      if (msg === CEO_CONTRACT_NOT_FOUND_MESSAGE) {
        return ResponseHelper.error(res, msg, "CEO_CONTRACT_NOT_FOUND", 404);
      }
      const statusCode = statusForCEOScorecardError(msg);
      return ResponseHelper.error(res, msg || "Failed to generate CEO scorecard", undefined, statusCode);
    }
  }

  static async getBoardScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getBoardScorecard({
        viewer: req.user,
        ...getPeriodParams(req),
        persist: false,
        meta: buildMeta(req),
        sectionBlendMode: parseSectionBlendMode(req, false)
      });

      return ResponseHelper.success(res, "Board scorecard retrieved successfully", scorecard);
    } catch (error: any) {
      console.error("Error getting Board scorecard:", error);
      const msg = String(error.message || "");
      const low = msg.toLowerCase();
      if (low.includes("access denied")) {
        return ResponseHelper.error(res, "Access denied", undefined, 403, { code: "FORBIDDEN" });
      }
      if (msg === BOARD_CONTRACT_NOT_FOUND_MESSAGE) {
        return ResponseHelper.error(res, msg, "BOARD_CONTRACT_NOT_FOUND", 404, {
          code: "BOARD_CONTRACT_NOT_FOUND"
        });
      }
      if (low.includes("cannot save board scorecard") || low.includes("finalised board scorecard")) {
        return ResponseHelper.error(res, msg, undefined, 400);
      }
      return ResponseHelper.error(res, msg || "Failed to get Board scorecard", undefined, 500);
    }
  }

  static async generateBoardScorecard(req: Request, res: Response) {
    try {
      const scorecard = await PerformanceScorecardService.getBoardScorecard({
        viewer: req.user,
        ...getPeriodParamsFromBodyOrQuery(req),
        persist: true,
        meta: buildMeta(req),
        sectionBlendMode: parseSectionBlendMode(req, true)
      });

      return ResponseHelper.created(res, "Board scorecard generated successfully", scorecard);
    } catch (error: any) {
      console.error("Error generating Board scorecard:", error);
      const msg = String(error.message || "");
      const low = msg.toLowerCase();
      if (low.includes("access denied")) {
        return ResponseHelper.error(res, "Access denied", undefined, 403, { code: "FORBIDDEN" });
      }
      if (msg === BOARD_CONTRACT_NOT_FOUND_MESSAGE) {
        return ResponseHelper.error(res, msg, "BOARD_CONTRACT_NOT_FOUND", 404, {
          code: "BOARD_CONTRACT_NOT_FOUND"
        });
      }
      if (low.includes("cannot save board scorecard") || low.includes("finalised board scorecard")) {
        return ResponseHelper.error(res, msg, undefined, 400);
      }
      return ResponseHelper.error(res, msg || "Failed to generate Board scorecard", undefined, 500);
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
      const msg = String(error.message || "");
      if (msg.toLowerCase().includes("access denied")) {
        return ResponseHelper.error(res, "Access denied", undefined, 403, { code: "FORBIDDEN" });
      }
      return ResponseHelper.error(res, msg || "Failed to get organisational BSC dashboard", undefined, 500);
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
