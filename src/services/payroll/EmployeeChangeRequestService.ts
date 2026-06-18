// @ts-nocheck
import { prisma } from "../../utils/database";
import { isPrivilegedCheckerUserId } from "./payrollAccessHelpers";

export const SENSITIVE_EMPLOYEE_FIELDS = [
  "basicSalary",
  "salarySplitUsdPct",
  "salarySplitZigPct",
  "bankName",
  "branchCode",
  "accountNumber",
  "contractEffectiveDate",
  "departmentCode",
] as const;

export type SensitiveField = (typeof SENSITIVE_EMPLOYEE_FIELDS)[number];

export class EmployeeChangeRequestService {
  static async submitChangeRequest(
    employeeId: string,
    makerUserId: string,
    changeType: string,
    payload: Record<string, unknown>
  ) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new Error("Employee not found");

    const pending = await prisma.employeeChangeRequest.findFirst({
      where: { employeeId, status: "PENDING" },
    });
    if (pending) {
      throw new Error("Employee already has a pending change request");
    }

    return prisma.employeeChangeRequest.create({
      data: {
        employeeId,
        changeType,
        payload,
        status: "PENDING",
        makerUserId,
      },
      include: {
        maker: { select: { id: true, firstName: true, lastName: true, email: true } },
        employee: { select: { id: true, employeeNumber: true } },
      },
    });
  }

  static async listForEmployee(employeeId: string, status?: string) {
    return prisma.employeeChangeRequest.findMany({
      where: {
        employeeId,
        ...(status ? { status } : {}),
      },
      orderBy: { submittedAt: "desc" },
      include: {
        maker: { select: { id: true, firstName: true, lastName: true } },
        checker: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  static async approve(requestId: string, checkerUserId: string) {
    const req = await prisma.employeeChangeRequest.findUnique({
      where: { id: requestId },
      include: { employee: true },
    });
    if (!req) throw new Error("Change request not found");
    if (req.status !== "PENDING") throw new Error("Change request is not pending");
    if (req.makerUserId === checkerUserId) {
      const bypass = await isPrivilegedCheckerUserId(checkerUserId);
      if (!bypass) throw new Error("Checker must be different from maker");
    }

    const payload = req.payload as Record<string, unknown>;
    const updateData: Record<string, unknown> = {};
    for (const key of Object.keys(payload)) {
      if (key === "contractEffectiveDate" && payload[key]) {
        updateData.contractEffectiveDate = new Date(String(payload[key]));
      } else if (["basicSalary", "salarySplitUsdPct", "salarySplitZigPct"].includes(key)) {
        updateData[key] = payload[key];
      } else {
        updateData[key] = payload[key];
      }
    }

    const [updatedEmployee] = await prisma.$transaction([
      prisma.employee.update({
        where: { id: req.employeeId },
        data: updateData,
      }),
      prisma.employeeChangeRequest.update({
        where: { id: requestId },
        data: {
          status: "APPROVED",
          checkerUserId,
          resolvedAt: new Date(),
        },
      }),
    ]);

    return { request: req, employee: updatedEmployee };
  }

  static async reject(requestId: string, checkerUserId: string, reason?: string) {
    const req = await prisma.employeeChangeRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new Error("Change request not found");
    if (req.status !== "PENDING") throw new Error("Change request is not pending");
    if (req.makerUserId === checkerUserId) {
      const bypass = await isPrivilegedCheckerUserId(checkerUserId);
      if (!bypass) throw new Error("Checker must be different from maker");
    }

    return prisma.employeeChangeRequest.update({
      where: { id: requestId },
      data: {
        status: "REJECTED",
        checkerUserId,
        rejectionReason: reason || null,
        resolvedAt: new Date(),
      },
    });
  }

  static async hasPendingForEmployees(employeeIds: string[]): Promise<boolean> {
    if (!employeeIds.length) return false;
    const count = await prisma.employeeChangeRequest.count({
      where: { employeeId: { in: employeeIds }, status: "PENDING" },
    });
    return count > 0;
  }

  static filterSensitivePayload(body: Record<string, unknown>) {
    const sensitive: Record<string, unknown> = {};
    const direct: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) {
      if ((SENSITIVE_EMPLOYEE_FIELDS as readonly string[]).includes(k)) {
        sensitive[k] = v;
      } else {
        direct[k] = v;
      }
    }
    return { sensitive, direct };
  }
}
