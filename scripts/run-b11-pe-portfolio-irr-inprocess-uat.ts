/**
 * B.11 UAT — in-process portfolio IRR sync (POST /api/performance/integration/sync-pe-portfolio-irr).
 * No PERFORMANCE_INTERNAL_BASE_URL; service calls PortfolioDashboardService directly.
 *
 * Usage: B11_GOAL_ID=... npx ts-node scripts/run-b11-pe-portfolio-irr-inprocess-uat.ts
 * If B11_GOAL_ID is omitted, uses the first goal whose KPI name looks like IRR (required by API validation).
 */
import { prisma } from "../src/utils/database";
import { PerformanceIntegrationService } from "../src/services/PerformanceIntegrationService";
import { PortfolioDashboardService } from "../src/services/PortfolioDashboardService";
import {
  normaliseSyncedDecimal,
  PORTFOLIO_IRR_PE_SYNC_DECIMALS
} from "../src/services/performanceBackendSupport";

async function main() {
  const goalIdEnv = process.env.B11_GOAL_ID?.trim();
  let goal = goalIdEnv
    ? await prisma.performanceGoal.findUnique({
        where: { id: goalIdEnv },
        include: { kpi: { select: { id: true, name: true } } }
      })
    : await prisma.performanceGoal.findFirst({
        where: {
          OR: [
            { kpi: { name: { contains: "IRR" } } },
            { kpi: { name: { contains: "irr" } } },
            { kpi: { name: { contains: "Portfolio" } } }
          ]
        },
        orderBy: { id: "asc" },
        include: { kpi: { select: { id: true, name: true } } }
      });

  if (!goal && !goalIdEnv) {
    goal = await prisma.performanceGoal.findFirst({
      orderBy: { id: "asc" },
      include: { kpi: { select: { id: true, name: true } } }
    });
  }

  if (!goal) {
    throw new Error(
      "No IRR-compatible performance goal found. Create a goal with KPI name containing IRR (or formulaType IRR / PORTFOLIO_IRR_PCT), or set B11_GOAL_ID."
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: goal.createdById },
    include: { role: true }
  });
  if (!user) {
    throw new Error(`User ${goal.createdById} not found for goal actor.`);
  }

  const actor = {
    id: user.id,
    role: user.role,
    userDepartment: user.userDepartment || "Finance"
  };

  const before = await prisma.performanceGoal.findUnique({ where: { id: goal.id } });
  const pe = await PortfolioDashboardService.getWeightedFundGrossIrrForPeSync({});
  const expectedPrecise = normaliseSyncedDecimal(pe.irr, PORTFOLIO_IRR_PE_SYNC_DECIMALS);
  const asStoredNumber = (v: unknown) => Number(v ?? 0);

  const result = await PerformanceIntegrationService.runPePortfolioIrrSync({
    goalId: goal.id,
    actor
  });

  const job = await prisma.performanceSyncJob.findUnique({
    where: { id: result.syncJob.id }
  });
  const after = await prisma.performanceGoal.findUnique({ where: { id: goal.id } });

  const checks = {
    targetInProcess: job?.targetEndpoint === "in-process://pe-portfolio-irr",
    jobFinished:
      job?.status === "COMPLETED" ||
      job?.status === "PENDING_APPROVAL",
    /** DB may coerce "0.000000" ↔ "0"; compare numerically then normalised string form. */
    preciseMatchesPe:
      Math.abs(asStoredNumber(after?.preciseCurrentValue) - pe.irr) < 1e-9 ||
      Math.abs(asStoredNumber(after?.lastSyncedValue) - pe.irr) < 1e-9 ||
      normaliseSyncedDecimal(asStoredNumber(after?.preciseCurrentValue), PORTFOLIO_IRR_PE_SYNC_DECIMALS) ===
        expectedPrecise ||
      normaliseSyncedDecimal(asStoredNumber(after?.lastSyncedValue), PORTFOLIO_IRR_PE_SYNC_DECIMALS) ===
        expectedPrecise,
    responsePayloadHasIrr: (() => {
      const v = Number((job?.responsePayload as any)?.data?.metrics?.irr);
      return Number.isFinite(v) && Math.abs(v - pe.irr) < 1e-9;
    })()
  };

  const pass = Object.values(checks).every(Boolean);

  console.log(
    JSON.stringify(
      {
        success: true,
        uat: "B.11",
        goalId: goal.id,
        kpiName: goal.kpi?.name ?? null,
        peComputedIrr: pe.irr,
        expectedPrecise,
        before: {
          preciseCurrentValue: before?.preciseCurrentValue,
          lastSyncedValue: before?.lastSyncedValue
        },
        syncJob: {
          id: job?.id,
          targetEndpoint: job?.targetEndpoint,
          status: job?.status,
          approvalStatus: job?.approvalStatus
        },
        after: {
          preciseCurrentValue: after?.preciseCurrentValue,
          lastSyncedValue: after?.lastSyncedValue,
          isPendingApproval: after?.isPendingApproval,
          currentValue: after?.currentValue
        },
        checks,
        pass
      },
      null,
      2
    )
  );

  if (!pass) {
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error("B11_UAT_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
