// @ts-nocheck
import { prisma } from "../utils/database";
import { PerformanceIntegrationService } from "./PerformanceIntegrationService";
import { isPayrollTurnoverCompatibleGoal } from "./performanceBackendSupport";

export type TerminateEmployeeParams = {
  employeeId: string;
  /** Authenticated user performing the action (for PM sync + audit). */
  performedBy: { id: string; role?: { permissions?: { name: string; value: boolean }[] } };
  reason?: string | null;
};

/**
 * Mark an employee as terminated: HR flag, payroll roster, performance contracts, and turnover KPI sync.
 */
export class EmployeeTerminationService {
  static async terminateEmployee(params: TerminateEmployeeParams) {
    const { employeeId, performedBy, reason } = params;

    const before = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }
    });
    if (!before) {
      throw new Error("Employee not found");
    }
    if (before.terminated) {
      throw new Error("Employee is already terminated");
    }

    const now = new Date();
    const userId = before.userId;

    const [updated, contractResult] = await prisma.$transaction([
      prisma.employee.update({
        where: { id: employeeId },
        data: {
          terminated: true,
          terminatedAt: now,
          terminationReason: reason != null && String(reason).trim() !== "" ? String(reason).trim() : null,
          isActive: false,
          // Suspend already sets this to "SUSPENDED" (PayrollExtendedController); terminate left it at
          // whatever it was (usually "ACTIVE"), a stale value on a free-text field. No current query relies on
          // it alone here -- every isActive/lifecycleStatus query checks terminated too -- but it's simply
          // wrong data, found live while verifying terminate-employee (PF-01/payroll-v6-findings-2026-09-28.md).
          lifecycleStatus: "TERMINATED",
        },
        include: {
          user: { select: { firstName: true, lastName: true, email: true } },
          currency: true
        }
      }),
      prisma.performanceContract.updateMany({
        where: {
          subjectUserId: userId,
          contractType: "EMPLOYEE",
          status: { notIn: ["ARCHIVED", "CANCELLED"] }
        },
        data: { status: "CANCELLED" }
      })
    ]);

    let turnoverSync: { kpiId: string; ok: boolean; error?: string }[] = [];
    try {
      turnoverSync = await this.syncAllPayrollTurnoverGoals(performedBy);
    } catch (e: any) {
      console.warn("[EmployeeTermination] turnover sync error:", e?.message || e);
    }

    return {
      employee: updated,
      performanceContractsCancelled: contractResult.count,
      turnoverKpiSyncAttempts: turnoverSync
    };
  }

  /**
   * Re-runs in-process payroll turnover for every KPI that has at least one eligible goal.
   */
  static async syncAllPayrollTurnoverGoals(performedBy: { id: string; role?: { permissions?: any } }) {
    const goals = await prisma.performanceGoal.findMany({
      where: { kpiId: { not: null } },
      include: { kpi: { select: { id: true, name: true } } }
    });
    const eligible = goals.filter((g) => isPayrollTurnoverCompatibleGoal(g));
    const kpiIds = [...new Set(eligible.map((g) => g.kpiId).filter(Boolean))];
    const results: { kpiId: string; ok: boolean; error?: string }[] = [];
    for (const kpiId of kpiIds) {
      try {
        await PerformanceIntegrationService.runPayrollTurnoverRateSync({
          kpiId: String(kpiId),
          actor: performedBy
        });
        results.push({ kpiId: String(kpiId), ok: true });
      } catch (e: any) {
        results.push({ kpiId: String(kpiId), ok: false, error: e?.message || String(e) });
      }
    }
    return results;
  }
}
