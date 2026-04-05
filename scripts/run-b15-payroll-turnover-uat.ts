/**
 * B.15 UAT — Payroll employee turnover rate → PM goal (in-process sync).
 *
 * By default:
 * 1. Snapshot baseline headcount from `Employee`.
 * 2. Create a disposable **User** + **Employee** with `isActive: false` (terminated / off active roster).
 * 3. Assert inactive count increased by 1 and turnover % recalculated.
 * 4. Run sync; goal must match new `turnoverRatePct`.
 * 5. Delete the disposable user (Employee cascades).
 *
 * Env:
 *   B15_GOAL_ID — optional; pin a turnover-compatible goal.
 *   B15_SKIP_TERMINATED_FIXTURE=1 — skip user/employee creation; only sync vs current DB (no headcount delta checks).
 *
 * Usage: npm run test:uat:performance-b15-payroll-turnover
 */
import bcrypt from "bcrypt";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";
import { DataIntegrationService } from "../src/services/DataIntegrationService";
import { PerformanceIntegrationService } from "../src/services/PerformanceIntegrationService";
import { isPayrollTurnoverCompatibleGoal } from "../src/services/performanceBackendSupport";

const UAT_KPI_NAME = "UAT B.15 — Employee Turnover Rate";
const UAT_GOAL_TITLE = "UAT B.15 — Employee turnover (Payroll headcount)";

function asStoredNumber(v: unknown) {
  return Number(v ?? 0);
}

async function ensureActorUser() {
  const user = await prisma.user.findFirst({
    orderBy: { id: "asc" },
    include: { role: true }
  });
  if (!user?.role) throw new Error("No user with role found — cannot run B.15 UAT.");
  return user;
}

async function ensureTurnoverGoal(goalIdEnv: string | undefined, actorUserId: string) {
  if (goalIdEnv) {
    const g = await prisma.performanceGoal.findUnique({
      where: { id: goalIdEnv },
      include: { kpi: { select: { id: true, name: true } } }
    });
    if (!g) throw new Error(`B15_GOAL_ID not found: ${goalIdEnv}`);
    if (!isPayrollTurnoverCompatibleGoal(g)) {
      throw new Error(`Goal ${goalIdEnv} is not payroll-turnover-compatible.`);
    }
    return g;
  }

  const all = await prisma.performanceGoal.findMany({
    include: { kpi: { select: { id: true, name: true } } },
    orderBy: { id: "asc" }
  });
  const found = all.find((row) => isPayrollTurnoverCompatibleGoal(row));
  if (found) return found;

  let kpi = await prisma.kPI.findFirst({ where: { name: UAT_KPI_NAME } });
  if (!kpi) {
    kpi = await prisma.kPI.create({
      data: {
        name: UAT_KPI_NAME,
        type: "Percentage",
        hasUnit: true,
        unitCategory: "Percentage",
        unit: "%",
        unitSymbol: "%",
        isActive: true
      }
    });
  }

  let goal = await prisma.performanceGoal.findFirst({
    where: { title: UAT_GOAL_TITLE },
    include: { kpi: { select: { id: true, name: true } } }
  });
  if (!goal) {
    await prisma.performanceGoal.create({
      data: {
        title: UAT_GOAL_TITLE,
        description: "B.15 UAT — turnover from Payroll Employee isActive headcount.",
        type: "company",
        category: "Financial",
        scorecardPillar: "Learning, Growth & HR",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T23:59:59.999Z"),
        createdById: actorUserId,
        kpiId: kpi.id,
        formulaType: "EMPLOYEE_TURNOVER",
        targetValue: new Decimal(10),
        targetUnit: "%",
        currentValue: new Decimal(0),
        preciseCurrentValue: "0",
        progressPercentage: new Decimal(0),
        targetOperator: "<=",
        isReverseKpi: true,
        requiresManagerApproval: false,
        status: "active",
        stage: "in_progress"
      }
    });
    goal = await prisma.performanceGoal.findFirst({
      where: { title: UAT_GOAL_TITLE },
      include: { kpi: { select: { id: true, name: true } } }
    });
  }

  if (!goal) throw new Error("Failed to resolve B.15 UAT goal.");
  if (!isPayrollTurnoverCompatibleGoal(goal)) {
    throw new Error("B.15 UAT goal is not turnover-compatible.");
  }
  return goal;
}

async function main() {
  const goalIdEnv = process.env.B15_GOAL_ID?.trim();
  const skipFixture = process.env.B15_SKIP_TERMINATED_FIXTURE?.trim() === "1";

  const actorUser = await ensureActorUser();
  const goal = await ensureTurnoverGoal(goalIdEnv, actorUser.id);

  const syncActor = await prisma.user.findUnique({
    where: { id: goal.createdById },
    include: { role: true }
  });
  if (!syncActor?.role) {
    throw new Error(`Goal creator ${goal.createdById} missing role.`);
  }

  const actor = {
    id: syncActor.id,
    role: syncActor.role,
    userDepartment: syncActor.userDepartment || "HR"
  };

  const baseline = await DataIntegrationService.calculatePayrollEmployeeTurnoverMetrics();

  let disposableUserId: string | null = null;
  let terminatedEmployeeNumber: string | null = null;

  try {
    if (!skipFixture) {
      const role = await prisma.role.findFirst({ orderBy: { id: "asc" } });
      if (!role) {
        throw new Error("No Role row — cannot create disposable user.");
      }

      const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const email = `uat.b15.term.${suffix}@example.invalid`;
      terminatedEmployeeNumber = `UAT-B15-T-${suffix}`;
      const hashed = await bcrypt.hash("UatB15Disposable!", 10);

      const u = await prisma.user.create({
        data: {
          firstName: "UAT",
          lastName: "B15 Terminated",
          email,
          password: hashed,
          roleId: role.id
        }
      });
      disposableUserId = u.id;

      await prisma.employee.create({
        data: {
          userId: u.id,
          employeeNumber: terminatedEmployeeNumber,
          isActive: false
        }
      });
    }

    const expected = await DataIntegrationService.calculatePayrollEmployeeTurnoverMetrics();

    if (!skipFixture) {
      if (expected.inactiveHeadcount !== baseline.inactiveHeadcount + 1) {
        throw new Error(
          `Expected inactive headcount ${baseline.inactiveHeadcount + 1}, got ${expected.inactiveHeadcount}`
        );
      }
      if (expected.activeHeadcount !== baseline.activeHeadcount) {
        throw new Error(
          `Active headcount should be unchanged (${baseline.activeHeadcount}), got ${expected.activeHeadcount}`
        );
      }
      if (expected.totalHeadcount !== baseline.totalHeadcount + 1) {
        throw new Error(
          `Expected total headcount ${baseline.totalHeadcount + 1}, got ${expected.totalHeadcount}`
        );
      }
    }

    const result = await PerformanceIntegrationService.runPayrollTurnoverRateSync({
      goalId: goal.id,
      actor
    });

    const job = await prisma.performanceSyncJob.findUnique({
      where: { id: result.syncJob.id }
    });
    const after = await prisma.performanceGoal.findUnique({ where: { id: goal.id } });

    const tol = 0.02;
    const checks: Record<string, boolean> = {
      targetInProcess: job?.targetEndpoint === "in-process://payroll-turnover-rate",
      jobFinished: job?.status === "COMPLETED" || job?.status === "PENDING_APPROVAL",
      valueMatchesPayroll:
        Math.abs(asStoredNumber(after?.preciseCurrentValue) - expected.turnoverRatePct) <= tol ||
        Math.abs(asStoredNumber(after?.lastSyncedValue) - expected.turnoverRatePct) <= tol,
      payloadHasCounts: (() => {
        const m = (job?.responsePayload as any)?.data?.metrics;
        return (
          m &&
          Number(m.activeHeadcount) === expected.activeHeadcount &&
          Number(m.inactiveHeadcount) === expected.inactiveHeadcount &&
          Number(m.terminatedCount) === expected.terminatedCount
        );
      })()
    };

    if (!skipFixture) {
      checks.inactiveIncreasedByOne = expected.inactiveHeadcount === baseline.inactiveHeadcount + 1;
      checks.turnoverRateMatchesFormula =
        expected.totalHeadcount > 0
          ? Math.abs(
              expected.turnoverRatePct -
                Math.round((expected.inactiveHeadcount / expected.totalHeadcount) * 10000) / 100
            ) < 0.001
          : expected.turnoverRatePct === 0;
    }

    const pass = Object.values(checks).every(Boolean);

    console.log(
      JSON.stringify(
        {
          success: true,
          uat: "B.15",
          terminatedFixture: skipFixture
            ? null
            : {
                disposableUserId,
                employeeNumber: terminatedEmployeeNumber,
                baselineHeadcount: baseline,
                afterHeadcount: expected,
                turnoverRateBefore: baseline.turnoverRatePct,
                turnoverRateAfter: expected.turnoverRatePct
              },
          payrollMetrics: expected,
          goalId: goal.id,
          kpiName: goal.kpi?.name ?? null,
          scorecardPillar: goal.scorecardPillar,
          syncJob: {
            id: job?.id,
            targetEndpoint: job?.targetEndpoint,
            status: job?.status
          },
          after: {
            preciseCurrentValue: after?.preciseCurrentValue,
            lastSyncedValue: after?.lastSyncedValue,
            currentValue: after?.currentValue,
            isPendingApproval: after?.isPendingApproval
          },
          checks,
          pass
        },
        null,
        2
      )
    );

    if (!pass) process.exitCode = 1;
  } finally {
    if (disposableUserId) {
      await prisma.user
        .delete({ where: { id: disposableUserId } })
        .catch((err) => console.error("B.15 UAT: cleanup disposable user failed:", err));
    }
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  void prisma.$disconnect();
  process.exit(1);
});
