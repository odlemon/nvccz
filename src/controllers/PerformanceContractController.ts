// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import {
  createBoardPerformanceContract,
  createCEOPerformanceContract,
  createDepartmentPerformanceContract,
  createEmployeePerformanceContractInTransaction,
  PerformanceContractDuplicateError,
  resolveCeoSubjectUserIdFromOrg
} from "../services/PerformanceContractSetupService";

function createdBy(req: Request, body: Record<string, unknown>): string {
  const fromBody = body.createdById != null ? String(body.createdById).trim() : "";
  if (fromBody) return fromBody;
  const u = req.user?.id;
  if (!u) throw new Error("createdById or authenticated user required");
  return String(u);
}

/**
 * Explicit performance contract setup (annual cycle). No role checks — identity only via `authenticate`.
 * Matches org process: Board PC → CEO PC → Department PCs → Employee PCs for the period.
 */
export class PerformanceContractController {
  /**
   * List performance contracts with optional filters. JWT required (`authenticate` only).
   * Defaults to newest-first; capped by `take` (max 2000).
   */
  static async list(req: Request, res: Response) {
    try {
      const contractType =
        req.query.contractType != null && String(req.query.contractType).trim() !== ""
          ? String(req.query.contractType).trim()
          : undefined;
      const status =
        req.query.status != null && String(req.query.status).trim() !== ""
          ? String(req.query.status).trim()
          : undefined;
      const subjectUserId =
        req.query.subjectUserId != null && String(req.query.subjectUserId).trim() !== ""
          ? String(req.query.subjectUserId).trim()
          : undefined;
      const departmentName =
        req.query.departmentName != null && String(req.query.departmentName).trim() !== ""
          ? String(req.query.departmentName).trim()
          : undefined;
      const periodLabel =
        req.query.periodLabel != null && String(req.query.periodLabel).trim() !== ""
          ? String(req.query.periodLabel).trim()
          : undefined;

      const periodYearRaw =
        req.query.periodYear != null && String(req.query.periodYear).trim() !== ""
          ? Number.parseInt(String(req.query.periodYear).trim(), 10)
          : NaN;

      const takeRaw =
        req.query.take != null && String(req.query.take).trim() !== ""
          ? Number.parseInt(String(req.query.take).trim(), 10)
          : 500;
      const skipRaw =
        req.query.skip != null && String(req.query.skip).trim() !== ""
          ? Number.parseInt(String(req.query.skip).trim(), 10)
          : 0;

      const take = Number.isFinite(takeRaw) ? Math.min(Math.max(takeRaw, 1), 2000) : 500;
      const skip = Number.isFinite(skipRaw) && skipRaw >= 0 ? skipRaw : 0;

      const where: Record<string, unknown> = {};
      if (contractType) where.contractType = contractType;
      if (status) where.status = status;
      if (subjectUserId) where.subjectUserId = subjectUserId;
      if (departmentName) where.departmentName = departmentName;
      if (periodLabel) where.periodLabel = periodLabel;

      const andClauses: Record<string, unknown>[] = [];
      if (Number.isFinite(periodYearRaw) && periodYearRaw >= 2000 && periodYearRaw <= 2100) {
        const y = periodYearRaw;
        const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
        andClauses.push({ periodStart: { lte: end } }, { periodEnd: { gte: start } });
      }
      if (andClauses.length) {
        where.AND = andClauses;
      }

      const [total, contracts] = await prisma.$transaction([
        prisma.performanceContract.count({ where }),
        prisma.performanceContract.findMany({
          where,
          orderBy: [{ periodStart: "desc" }, { createdAt: "desc" }],
          skip,
          take,
          include: {
            subjectUser: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                userDepartment: true
              }
            },
            reviewer: {
              select: { id: true, firstName: true, lastName: true, email: true }
            },
            approver: {
              select: { id: true, firstName: true, lastName: true, email: true }
            },
            createdBy: {
              select: { id: true, firstName: true, lastName: true, email: true }
            }
          }
        })
      ]);

      res.json({
        success: true,
        count: contracts.length,
        total,
        skip,
        take,
        data: contracts
      });
    } catch (e: any) {
      res.status(400).json({
        success: false,
        message: e?.message || "Failed to list performance contracts"
      });
    }
  }

  static async createBoard(req: Request, res: Response) {
    try {
      const out = await createBoardPerformanceContract({
        createdById: createdBy(req, req.body),
        title: req.body.title,
        subjectUserId: req.body.subjectUserId,
        reviewerUserId: req.body.reviewerUserId,
        approverUserId: req.body.approverUserId,
        periodYear: req.body.periodYear,
        periodLabel: req.body.periodLabel,
        periodStart: req.body.periodStart,
        periodEnd: req.body.periodEnd
      });
      res.status(201).json({ success: true, ...out });
    } catch (e: any) {
      if (e instanceof PerformanceContractDuplicateError) {
        return res.status(409).json({
          success: false,
          code: e.code,
          message: e.message,
          existingContractId: e.existingContractId,
          periodYear: e.periodYear
        });
      }
      res.status(400).json({ success: false, message: e?.message || "Failed to create Board PC" });
    }
  }

  static async createCEO(req: Request, res: Response) {
    try {
      let subjectUserId =
        req.body.subjectUserId != null && String(req.body.subjectUserId).trim() !== ""
          ? String(req.body.subjectUserId).trim()
          : "";
      if (!subjectUserId) {
        subjectUserId = await resolveCeoSubjectUserIdFromOrg();
      }
      const out = await createCEOPerformanceContract({
        createdById: createdBy(req, req.body),
        subjectUserId,
        title: req.body.title,
        reviewerUserId: req.body.reviewerUserId,
        approverUserId: req.body.approverUserId,
        periodYear: req.body.periodYear,
        periodLabel: req.body.periodLabel,
        periodStart: req.body.periodStart,
        periodEnd: req.body.periodEnd
      });
      res.status(201).json({ success: true, ...out });
    } catch (e: any) {
      if (e instanceof PerformanceContractDuplicateError) {
        return res.status(409).json({
          success: false,
          code: e.code,
          message: e.message,
          existingContractId: e.existingContractId,
          periodYear: e.periodYear
        });
      }
      res.status(400).json({ success: false, message: e?.message || "Failed to create CEO PC" });
    }
  }

  static async createDepartment(req: Request, res: Response) {
    try {
      const out = await createDepartmentPerformanceContract({
        createdById: createdBy(req, req.body),
        departmentName: req.body.departmentName,
        title: req.body.title,
        periodYear: req.body.periodYear,
        periodLabel: req.body.periodLabel,
        periodStart: req.body.periodStart,
        periodEnd: req.body.periodEnd
      });
      res.status(201).json({ success: true, ...out });
    } catch (e: any) {
      if (e instanceof PerformanceContractDuplicateError) {
        return res.status(409).json({
          success: false,
          code: e.code,
          message: e.message,
          existingContractId: e.existingContractId,
          periodYear: e.periodYear
        });
      }
      res.status(400).json({
        success: false,
        message: e?.message || "Failed to create department PC"
      });
    }
  }

  static async createEmployee(req: Request, res: Response) {
    try {
      const subjectUserId = req.body.subjectUserId != null ? String(req.body.subjectUserId).trim() : "";
      if (!subjectUserId) {
        return res.status(400).json({ success: false, message: "subjectUserId is required" });
      }

      const user = await prisma.user.findUnique({
        where: { id: subjectUserId },
        select: { firstName: true, lastName: true, userDepartment: true }
      });
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const deptFromBody =
        req.body.departmentName != null && String(req.body.departmentName).trim() !== ""
          ? String(req.body.departmentName).trim()
          : null;

      const out = await prisma.$transaction(async (tx) => {
        return createEmployeePerformanceContractInTransaction(tx, {
          subjectUserId,
          departmentName: deptFromBody ?? user.userDepartment ?? null,
          createdById: createdBy(req, req.body),
          employeeFirstName: req.body.firstName ?? user.firstName ?? "",
          employeeLastName: req.body.lastName ?? user.lastName ?? "",
          periodYear: req.body.periodYear,
          periodLabel: req.body.periodLabel,
          periodStart: req.body.periodStart,
          periodEnd: req.body.periodEnd,
          rejectIfDuplicate: true
        });
      });

      res.status(201).json({ success: true, ...out });
    } catch (e: any) {
      if (e instanceof PerformanceContractDuplicateError) {
        return res.status(409).json({
          success: false,
          code: e.code,
          message: e.message,
          existingContractId: e.existingContractId,
          periodYear: e.periodYear
        });
      }
      res.status(400).json({
        success: false,
        message: e?.message || "Failed to create employee PC"
      });
    }
  }
}
