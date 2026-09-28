// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { EmployeeChangeRequestService } from "../services/payroll/EmployeeChangeRequestService";
import { PayrollRunApprovalService } from "../services/payroll/PayrollRunApprovalService";
import { PayslipDocumentService } from "../services/payroll/PayslipDocumentService";
import { PayrollComplianceService } from "../services/payroll/PayrollComplianceService";
import { ComplianceExpiryCronService } from "../services/payroll/ComplianceExpiryCronService";
import { assertPayrollHrAccess } from "../services/payroll/payrollAccessHelpers";
import { PayrollAuditService } from "../services/payroll/PayrollAuditService";

function assertHrRole(req: Request, res: Response): boolean {
  return assertPayrollHrAccess(req, res);
}

function coerceDateField(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (v instanceof Date) return v;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T00:00:00.000Z`);
  return new Date(s);
}

function withStatutoryDates<T extends Record<string, unknown>>(body: T): T {
  const out = { ...body };
  if ("effectiveFrom" in out) out.effectiveFrom = coerceDateField(out.effectiveFrom) as T["effectiveFrom"];
  if ("effectiveTo" in out) out.effectiveTo = coerceDateField(out.effectiveTo) as T["effectiveTo"];
  return out;
}

async function resolveEmployeeForUser(userId: string) {
  return prisma.employee.findUnique({ where: { userId } });
}

export class PayrollExtendedController {
  static async suspendEmployee(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const { id } = req.params;
      const employee = await prisma.employee.update({
        where: { id },
        data: { lifecycleStatus: "SUSPENDED", isActive: false },
      });
      res.json({ success: true, data: employee });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async reinstateEmployee(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const { id } = req.params;
      const employee = await prisma.employee.update({
        where: { id },
        data: { lifecycleStatus: "ACTIVE", isActive: true, terminated: false },
      });
      // Performance's turnover-rate goals are recomputed on termination; a reinstatement changes the rate back
      try {
        const { EmployeeTerminationService } = await import("../services/EmployeeTerminationService");
        await EmployeeTerminationService.syncAllPayrollTurnoverGoals((req as any).user);
      } catch (syncErr: any) {
        console.warn("[payroll] turnover KPI re-sync after reinstatement skipped:", syncErr?.message || syncErr);
      }
      res.json({ success: true, data: employee });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async submitChangeRequest(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const { id } = req.params;
      const { changeType, payload } = req.body;
      const makerUserId = (req as any).user.id;
      const result = await EmployeeChangeRequestService.submitChangeRequest(
        id,
        makerUserId,
        changeType,
        payload || {}
      );
      res.status(201).json({ success: true, data: result });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async listChangeRequests(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { status } = req.query;
      const data = await EmployeeChangeRequestService.listForEmployee(
        id,
        status ? String(status) : undefined
      );
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async approveChangeRequest(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const { requestId } = req.params;
      const checkerUserId = (req as any).user.id;
      const result = await EmployeeChangeRequestService.approve(requestId, checkerUserId);
      res.json({ success: true, data: result });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async rejectChangeRequest(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const { requestId } = req.params;
      const { reason } = req.body;
      const checkerUserId = (req as any).user.id;
      const result = await EmployeeChangeRequestService.reject(requestId, checkerUserId, reason);
      res.json({ success: true, data: result });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async submitRunForApproval(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const { payrollRunId } = req.params;
      const data = await PayrollRunApprovalService.submitForApproval(
        payrollRunId,
        (req as any).user.id
      );
      await PayrollAuditService.record({
        action: "PAYROLL_RUN_SUBMITTED",
        eventClass: "Approval",
        entityType: "payroll_run",
        entityId: payrollRunId,
        entityLabel: (data as any)?.name ?? null,
        detail: `Submitted ${(data as any)?.payPeriod ?? payrollRunId} for independent approval`,
        actor: (req as any).user,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async approveRun(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const { payrollRunId } = req.params;
      const data = await PayrollRunApprovalService.approve(payrollRunId, (req as any).user.id);
      await PayrollAuditService.record({
        action: "PAYROLL_RUN_APPROVED",
        eventClass: "Approval",
        entityType: "payroll_run",
        entityId: payrollRunId,
        entityLabel: (data as any)?.name ?? null,
        detail: `Approved ${(data as any)?.payPeriod ?? payrollRunId} by an independent checker`,
        actor: (req as any).user,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async rejectRun(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const { payrollRunId } = req.params;
      const { reason } = req.body;
      const data = await PayrollRunApprovalService.reject(
        payrollRunId,
        (req as any).user.id,
        reason
      );
      await PayrollAuditService.record({
        action: "PAYROLL_RUN_REJECTED",
        eventClass: "Approval",
        entityType: "payroll_run",
        entityId: payrollRunId,
        entityLabel: (data as any)?.name ?? null,
        detail: reason ? `Returned for correction: ${reason}` : 'Returned for correction',
        actor: (req as any).user,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async listBrackets(req: Request, res: Response) {
    try {
      const { currencyCode } = req.query;
      const data = await prisma.zimraTaxBracket.findMany({
        where: {
          isActive: true,
          ...(currencyCode ? { currencyCode: String(currencyCode) } : {}),
        },
        orderBy: [{ currencyCode: "asc" }, { lowerBound: "asc" }],
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async createBracket(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const data = await prisma.zimraTaxBracket.create({ data: withStatutoryDates(req.body) });
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async updateBracket(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const data = await prisma.zimraTaxBracket.update({
        where: { id: req.params.id },
        data: withStatutoryDates(req.body),
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async deleteBracket(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const data = await prisma.zimraTaxBracket.update({
        where: { id: req.params.id },
        data: { isActive: false },
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async listLevies(req: Request, res: Response) {
    try {
      const data = await prisma.statutoryLevyConfig.findMany({
        where: { isActive: true },
        orderBy: [{ levyCode: "asc" }, { currencyCode: "asc" }],
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async upsertLevies(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const items = Array.isArray(req.body) ? req.body : [req.body];
      const results = [];
      for (const item of items) {
        const normalized = withStatutoryDates(item);
        const row = await prisma.statutoryLevyConfig.upsert({
          where: {
            levyCode_currencyCode_effectiveFrom: {
              levyCode: normalized.levyCode,
              currencyCode: normalized.currencyCode,
              effectiveFrom: normalized.effectiveFrom as Date,
            },
          },
          create: normalized,
          update: {
            rate: normalized.rate,
            ceiling: normalized.ceiling,
            effectiveTo: normalized.effectiveTo ? (normalized.effectiveTo as Date) : null,
            isActive: normalized.isActive ?? true,
          },
        });
        results.push(row);
      }
      res.json({ success: true, data: results });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async downloadPayslip(req: Request, res: Response) {
    try {
      const { payslipId } = req.params;
      const buffer = await PayslipDocumentService.getPdfBuffer(payslipId);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="payslip-${payslipId}.pdf"`);
      res.send(buffer);
    } catch (e: any) {
      res.status(404).json({ success: false, message: e.message });
    }
  }

  static async verifyPayslip(req: Request, res: Response) {
    try {
      const { payslipId } = req.params;
      const result = await PayslipDocumentService.verify(payslipId);
      res.json({ success: true, data: result });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async downloadOwnPayslip(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const employee = await resolveEmployeeForUser(userId);
      if (!employee) {
        return res.status(404).json({ success: false, message: "Employee record not found" });
      }
      const payslip = await prisma.payslip.findUnique({ where: { id: req.params.payslipId } });
      if (!payslip || payslip.employeeId !== employee.id) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      const buffer = await PayslipDocumentService.getPdfBuffer(payslip.id);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="payslip-${payslip.id}.pdf"`);
      res.send(buffer);
    } catch (e: any) {
      res.status(404).json({ success: false, message: e.message });
    }
  }

  static async verifyOwnPayslip(req: Request, res: Response) {
    try {
      const userId = (req as any).user.id;
      const employee = await resolveEmployeeForUser(userId);
      if (!employee) {
        return res.status(404).json({ success: false, message: "Employee record not found" });
      }
      const payslip = await prisma.payslip.findUnique({ where: { id: req.params.payslipId } });
      if (!payslip || payslip.employeeId !== employee.id) {
        return res.status(403).json({ success: false, message: "Access denied" });
      }
      const result = await PayslipDocumentService.verify(payslip.id);
      res.json({ success: true, data: result });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}

export class PayrollComplianceController {
  static async createCourse(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const data = await PayrollComplianceService.createCourse(req.body);
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async listCourses(req: Request, res: Response) {
    try {
      const data = await PayrollComplianceService.listCourses(req.query.activeOnly !== "false");
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async updateCourse(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const data = await PayrollComplianceService.updateCourse(req.params.id, req.body);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async deleteCourse(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const data = await PayrollComplianceService.deleteCourse(req.params.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async createAssignment(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const data = await PayrollComplianceService.createAssignment(req.body);
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async listAssignments(req: Request, res: Response) {
    try {
      const data = await PayrollComplianceService.listAssignments({
        courseId: req.query.courseId ? String(req.query.courseId) : undefined,
        scopeType: req.query.scopeType ? String(req.query.scopeType) : undefined,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async deleteAssignment(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const data = await PayrollComplianceService.deleteAssignment(req.params.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async createCertification(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const body = req.body;
      const data = await PayrollComplianceService.createCertification(
        {
          employeeId: body.employeeId,
          courseId: body.courseId,
          issuedDate: new Date(body.issuedDate),
          expirationDate: new Date(body.expirationDate),
          verifiedById: (req as any).user.id,
        },
        (req as any).file
      );
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async listCertifications(req: Request, res: Response) {
    try {
      const data = await PayrollComplianceService.listCertifications({
        employeeId: req.query.employeeId ? String(req.query.employeeId) : undefined,
        courseId: req.query.courseId ? String(req.query.courseId) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async getCertification(req: Request, res: Response) {
    try {
      const data = await PayrollComplianceService.getCertification(req.params.id);
      if (!data) return res.status(404).json({ success: false, message: "Not found" });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async renewCertification(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const body = req.body;
      const data = await PayrollComplianceService.renewCertification(
        req.params.id,
        {
          issuedDate: new Date(body.issuedDate),
          expirationDate: new Date(body.expirationDate),
          verifiedById: (req as any).user.id,
        },
        (req as any).file
      );
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async revokeCertification(req: Request, res: Response) {
    try {
      if (!assertHrRole(req, res)) return;
      const data = await PayrollComplianceService.revokeCertification(req.params.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async expiringDashboard(req: Request, res: Response) {
    try {
      const data = await PayrollComplianceService.expiringDashboard();
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async runExpiryCron(req: Request, res: Response) {
    try {
      const secret =
        req.headers["x-compliance-cron-secret"] || req.headers["x-cron-secret"];
      const expected = process.env.COMPLIANCE_CRON_SECRET || process.env.CRON_SECRET;
      if (expected && secret !== expected) {
        return res.status(403).json({ success: false, message: "Invalid cron secret" });
      }
      const result = await ComplianceExpiryCronService.runExpiryCheck();
      res.json({ success: true, data: result });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
}
