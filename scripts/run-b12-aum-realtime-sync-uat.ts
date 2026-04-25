/**
 * B.12 UAT — AUM real-time sync: bump `Fund.totalAmount` (accounting portfolio),
 * run in-process AUM sync, assert PM goal matches `DataIntegrationService.calculateAUM()`.
 *
 * If no AUM-compatible goal (or OPEN fund) exists, creates minimal disposable fixtures
 * (idempotent names — safe to re-run). Set B12_CLEANUP=1 to delete fixtures this run created.
 *
 * Env:
 *   B12_GOAL_ID   — optional; pin a specific goal
 *   B12_FUND_ID   — optional; pin a specific fund
 *   B12_DELTA     — optional; default 12345.67 added to fund.totalAmount
 *   B12_CLEANUP   — optional; if "1", delete disposable goal/KPI/fund created this run (not pre-existing)
 *
 * Usage: npm run test:uat:performance-b12-aum-realtime-sync
 */
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";
import { DataIntegrationService } from "../src/services/DataIntegrationService";
import { PerformanceIntegrationService } from "../src/services/PerformanceIntegrationService";
import {
  isPortfolioAumCompatibleGoal,
  normaliseSyncedDecimal
} from "../src/services/performanceBackendSupport";

const UAT_KPI_NAME = "UAT B.12 — AUM KPI";
const UAT_GOAL_TITLE = "UAT B.12 — Assets Under Management sync";
const UAT_FUND_NAME = "UAT B.12 — Disposable OPEN fund";

function asStoredNumber(v: unknown) {
  return Number(v ?? 0);
}

async function ensureActorUser() {
  const user = await prisma.user.findFirst({
    orderBy: { id: "asc" },
    include: { role: true }
  });
  if (!user?.role) {
    throw new Error("No user with role found — cannot run B.12 UAT.");
  }
  return user;
}

async function ensureFund(
  fundIdEnv: string | undefined,
  createdById: string
): Promise<{ fund: { id: string; name: string; totalAmount: unknown }; createdFund: boolean }> {
  if (fundIdEnv) {
    const f = await prisma.fund.findUnique({ where: { id: fundIdEnv } });
    if (!f) {
      throw new Error(`B12_FUND_ID not found: ${fundIdEnv}`);
    }
    return { fund: f, createdFund: false };
  }

  let f = await prisma.fund.findFirst({
    where: { status: "OPEN" },
    orderBy: { id: "asc" }
  });
  if (f) {
    return { fund: f, createdFund: false };
  }

  const now = new Date();
  f = await prisma.fund.create({
    data: {
      name: UAT_FUND_NAME,
      description: "Created by B.12 AUM UAT — OPEN fund for portfolio totalAmount tests.",
      totalAmount: new Decimal(1_000_000),
      remainingAmount: new Decimal(500_000),
      minInvestment: new Decimal(1_000),
      maxInvestment: new Decimal(100_000),
      focusIndustries: [],
      applicationStart: now,
      applicationEnd: new Date(now.getTime() + 86400000 * 365),
      status: "OPEN",
      createdById
    }
  });
  return { fund: f, createdFund: true };
}

async function ensureAumGoal(goalIdEnv: string | undefined, actorUserId: string) {
  if (goalIdEnv) {
    const g = await prisma.performanceGoal.findUnique({
      where: { id: goalIdEnv },
      include: { kpi: { select: { id: true, name: true } } }
    });
    if (!g) {
      throw new Error(`B12_GOAL_ID not found: ${goalIdEnv}`);
    }
    if (!isPortfolioAumCompatibleGoal(g)) {
      throw new Error(`Goal ${goalIdEnv} is not AUM-compatible (use an AUM KPI or formulaType AUM / AUM_TOTAL).`);
    }
    return {
      goal: g,
      createdKpi: false,
      createdGoal: false
    };
  }

  const withKpi = await prisma.performanceGoal.findMany({
    include: { kpi: { select: { id: true, name: true } } },
    orderBy: { id: "asc" }
  });
  const existing = withKpi.find((row) => isPortfolioAumCompatibleGoal(row));
  if (existing) {
    return { goal: existing, createdKpi: false, createdGoal: false };
  }

  let kpi = await prisma.kPI.findFirst({ where: { name: UAT_KPI_NAME } });
  let createdKpi = false;
  if (!kpi) {
    kpi = await prisma.kPI.create({
      data: {
        name: UAT_KPI_NAME,
        type: "Metric",
        hasUnit: true,
        unitCategory: "Currency",
        unit: "USD",
        unitSymbol: "$",
        isActive: true
      }
    });
    createdKpi = true;
  }

  let goal = await prisma.performanceGoal.findFirst({
    where: { title: UAT_GOAL_TITLE },
    include: { kpi: { select: { id: true, name: true } } }
  });
  let createdGoal = false;
  if (!goal) {
    await prisma.performanceGoal.create({
      data: {
        title: UAT_GOAL_TITLE,
        description: "Disposable goal for B.12 AUM in-process sync UAT (auto-created).",
        type: "company",
        scorecardPillar: "Financial",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T23:59:59.999Z"),
        createdById: actorUserId,
        kpiId: kpi.id,
        formulaType: "AUM_TOTAL",
        targetValue: new Decimal(100_000_000),
        targetUnit: "USD",
        currentValue: new Decimal(0),
        preciseCurrentValue: "0",
        progressPercentage: new Decimal(0),
        targetOperator: ">=",
        isReverseKpi: false,
        requiresManagerApproval: false,
        status: "active",
        stage: "in_progress"
      }
    });
    createdGoal = true;
    goal = await prisma.performanceGoal.findFirst({
      where: { title: UAT_GOAL_TITLE },
      include: { kpi: { select: { id: true, name: true } } }
    });
  }

  if (!goal) {
    throw new Error("Failed to resolve UAT goal after create.");
  }
  if (!isPortfolioAumCompatibleGoal(goal)) {
    throw new Error("UAT goal is not AUM-compatible — check KPI name and formulaType.");
  }

  return { goal, createdKpi, createdGoal };
}

async function cleanupFixtures(params: {
  createdFund: boolean;
  createdGoal: boolean;
  createdKpi: boolean;
  fundId: string;
  goalId: string;
  kpiId: string | null;
}) {
  if (params.createdGoal) {
    await prisma.performanceGoal.deleteMany({ where: { id: params.goalId } }).catch(() => undefined);
  }
  if (params.createdKpi && params.kpiId) {
    const others = await prisma.performanceGoal.count({ where: { kpiId: params.kpiId } });
    if (others === 0) {
      await prisma.kPI.deleteMany({ where: { id: params.kpiId } }).catch(() => undefined);
    }
  }
  if (params.createdFund) {
    await prisma.fund.deleteMany({ where: { id: params.fundId } }).catch(() => undefined);
  }
}

async function main() {
  const deltaStr = process.env.B12_DELTA?.trim();
  const delta = deltaStr && !Number.isNaN(Number(deltaStr)) ? Number(deltaStr) : 12345.67;
  const doCleanup = process.env.B12_CLEANUP?.trim() === "1";

  const actorUser = await ensureActorUser();
  const fundIdEnv = process.env.B12_FUND_ID?.trim();
  const goalIdEnv = process.env.B12_GOAL_ID?.trim();

  const { fund, createdFund } = await ensureFund(fundIdEnv, actorUser.id);
  const { goal, createdKpi, createdGoal } = await ensureAumGoal(goalIdEnv, actorUser.id);

  const syncActorUser = await prisma.user.findUnique({
    where: { id: goal.createdById },
    include: { role: true }
  });
  if (!syncActorUser?.role) {
    throw new Error(`Goal creator ${goal.createdById} missing — using first user for sync actor.`);
  }

  const actor = {
    id: syncActorUser.id,
    role: syncActorUser.role,
    userDepartment: syncActorUser.userDepartment || "Finance"
  };

  const originalTotal = new Decimal(fund.totalAmount.toString());
  const bumped = originalTotal.plus(new Decimal(delta));
  const beforeSync = await prisma.performanceGoal.findUnique({
    where: { id: goal.id },
    select: { lastSyncedAt: true }
  });

  await prisma.fund.update({
    where: { id: fund.id },
    data: { totalAmount: bumped }
  });

  try {
    const aumAfterBump = await DataIntegrationService.calculateAUM();
    const expectedTotal = aumAfterBump.totalAUM.toNumber();
    const expectedPrecise = normaliseSyncedDecimal(expectedTotal, 6);

    const result = await PerformanceIntegrationService.runPePortfolioAumSync({
      goalId: goal.id,
      actor
    });

    const job = await prisma.performanceSyncJob.findUnique({
      where: { id: result.syncJob.id }
    });
    const after = await prisma.performanceGoal.findUnique({ where: { id: goal.id } });

    const checks = {
      targetInProcess: job?.targetEndpoint === "in-process://pe-portfolio-aum",
      jobFinished:
        job?.status === "COMPLETED" ||
        job?.status === "PENDING_APPROVAL",
      valueMatchesAccountingAum:
        Math.abs(asStoredNumber(after?.preciseCurrentValue) - expectedTotal) < 0.01 ||
        Math.abs(asStoredNumber(after?.lastSyncedValue) - expectedTotal) < 0.01 ||
        normaliseSyncedDecimal(asStoredNumber(after?.preciseCurrentValue), 6) === expectedPrecise ||
        normaliseSyncedDecimal(asStoredNumber(after?.lastSyncedValue), 6) === expectedPrecise,
      responsePayloadHasAum: (() => {
        const v = Number((job?.responsePayload as any)?.data?.metrics?.totalAum);
        return Number.isFinite(v) && Math.abs(v - expectedTotal) < 0.01;
      })(),
      /** UAT: sync timestamp on the goal is set to a fresh server time. */
      lastSyncedAtUpdated: (() => {
        const t = after?.lastSyncedAt;
        if (!t) return false;
        const tMs = new Date(t).getTime();
        if (!Number.isFinite(tMs)) return false;
        if (beforeSync?.lastSyncedAt) {
          return tMs > new Date(beforeSync.lastSyncedAt).getTime();
        }
        return true;
      })()
    };

    const pass = Object.values(checks).every(Boolean);

    console.log(
      JSON.stringify(
        {
          success: true,
          uat: "B.12",
          fixtures: {
            createdFund,
            createdGoal,
            createdKpi,
            fundWasAutoCreated: createdFund,
            goalWasAutoCreated: createdGoal
          },
          fundId: fund.id,
          fundName: fund.name,
          deltaApplied: delta,
          goalId: goal.id,
          kpiName: goal.kpi?.name ?? null,
          expectedTotalAum: expectedTotal,
          expectedPrecise,
          syncJob: {
            id: job?.id,
            targetEndpoint: job?.targetEndpoint,
            status: job?.status,
            approvalStatus: job?.approvalStatus
          },
          after: {
            preciseCurrentValue: after?.preciseCurrentValue,
            lastSyncedValue: after?.lastSyncedValue,
            lastSyncedAt: after?.lastSyncedAt,
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
  } finally {
    await prisma.fund.update({
      where: { id: fund.id },
      data: { totalAmount: originalTotal }
    });
  }

  if (doCleanup && (createdFund || createdGoal || createdKpi)) {
    await cleanupFixtures({
      createdFund,
      createdGoal,
      createdKpi,
      fundId: fund.id,
      goalId: goal.id,
      kpiId: goal.kpiId ?? null
    });
    console.log(
      JSON.stringify({ uat: "B.12", cleanup: true, removed: { createdFund, createdGoal, createdKpi } }, null, 2)
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  void prisma.$disconnect();
  process.exit(1);
});
