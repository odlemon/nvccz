import { prisma } from "../../utils/database";
import { EmployeeChangeRequestService } from "./EmployeeChangeRequestService";
import { isPrivilegedCheckerUserId } from "./payrollAccessHelpers";

export class PayrollRunApprovalService {
  static async submitForApproval(payrollRunId: string, makerUserId: string) {
    const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!run) throw new Error("Payroll run not found");
    if (run.status !== "DRAFT") {
      throw new Error("Only DRAFT payroll runs can be submitted for approval");
    }

    const employeeIds = (
      await prisma.employee.findMany({
        where: {
          isActive: true,
          terminated: false,
          lifecycleStatus: { in: ["ACTIVE"] },
        },
        select: { id: true },
      })
    ).map((e) => e.id);

    const hasPending = await EmployeeChangeRequestService.hasPendingForEmployees(employeeIds);
    if (hasPending) {
      throw new Error("Cannot submit: one or more employees have pending change requests");
    }

    return prisma.payrollRun.update({
      where: { id: payrollRunId },
      data: {
        status: "PENDING_APPROVAL",
        approvalStatus: "PENDING",
        submittedById: makerUserId,
        submittedForApprovalAt: new Date(),
        processError: null,
      },
    });
  }

  static async approve(payrollRunId: string, checkerUserId: string) {
    const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!run) throw new Error("Payroll run not found");
    if (run.status !== "PENDING_APPROVAL" || run.approvalStatus !== "PENDING") {
      throw new Error("Payroll run is not pending approval");
    }
    if (run.submittedById === checkerUserId) {
      const bypass = await isPrivilegedCheckerUserId(checkerUserId);
      if (!bypass) throw new Error("Checker must be different from submitter");
    }

    return prisma.payrollRun.update({
      where: { id: payrollRunId },
      data: {
        status: "APPROVED",
        approvalStatus: "APPROVED",
        approvedById: checkerUserId,
        approvedAt: new Date(),
      },
    });
  }

  static async reject(payrollRunId: string, checkerUserId: string, reason?: string) {
    const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!run) throw new Error("Payroll run not found");
    if (run.status !== "PENDING_APPROVAL") {
      throw new Error("Payroll run is not pending approval");
    }
    if (run.submittedById === checkerUserId) {
      const bypass = await isPrivilegedCheckerUserId(checkerUserId);
      if (!bypass) throw new Error("Checker must be different from submitter");
    }

    return prisma.payrollRun.update({
      where: { id: payrollRunId },
      data: {
        status: "DRAFT",
        approvalStatus: "REJECTED",
        approvedById: checkerUserId,
        approvedAt: new Date(),
        processError: reason || "Rejected by checker",
      },
    });
  }

  static assertCanProcess(run: { status: string; approvalStatus: string }) {
    if (run.status !== "APPROVED" || run.approvalStatus !== "APPROVED") {
      throw new Error(
        "Payroll run must be approved before processing. Submit for approval and have a checker approve first."
      );
    }
  }
}
