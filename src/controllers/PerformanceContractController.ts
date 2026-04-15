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
