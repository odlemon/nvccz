/**
 * Ensures a turnover KPI + company goal exists for Postman UAT.
 *
 * - Finds an existing KPI whose name matches turnover/attrition/headcount.
 * - If none exist, creates one.
 * - Ensures a company goal in "Learning, Growth & HR" exists linked to that KPI.
 *
 * Run:
 *   npx ts-node --transpile-only scripts/ensure-uat-employee-turnover-goal.ts
 */
import "dotenv/config";
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../src/utils/database";

const PILLAR = "Learning, Growth & HR";
const DEFAULT_KPI_NAME = "Employee Turnover Rate";
const DEFAULT_GOAL_TITLE = "UAT — Employee Turnover Rate (Payroll)";

function matchesTurnover(name: string) {
  return /\bturnover\b|\battrition\b|headcount turnover|staff turnover|employee turnover/i.test(name || "");
}

async function main() {
  const actor = await prisma.user.findFirst({
    orderBy: { id: "asc" },
    include: { role: true }
  });
  if (!actor) throw new Error("No user found to own the goal.");

  const allKpis = await prisma.kPI.findMany({
    select: {
      id: true,
      name: true,
      type: true,
      isReverseKpi: true,
      unitSymbol: true,
      unitPosition: true,
      scorecardPillar: true,
      isActive: true
    },
    orderBy: { name: "asc" }
  });

  const turnoverCandidates = allKpis.filter((k) => matchesTurnover(k.name));
  let kpi =
    turnoverCandidates.find((k) => k.isActive) ||
    turnoverCandidates[0] ||
    (await prisma.kPI.findFirst({ where: { name: DEFAULT_KPI_NAME } }));

  if (!kpi) {
    kpi = await prisma.kPI.create({
      data: {
        name: DEFAULT_KPI_NAME,
        type: "Percentage",
        hasUnit: true,
        unitCategory: "Percentage",
        unit: "%",
        unitSymbol: "%",
        unitPosition: "suffix",
        isReverseKpi: true,
        isActive: true,
        scorecardPillar: PILLAR
      }
    });
  } else {
    const shouldUpdate =
      kpi.isActive === false || (kpi as any).scorecardPillar !== PILLAR || (kpi as any).isReverseKpi !== true;
    if (shouldUpdate) {
      kpi = await prisma.kPI.update({
        where: { id: kpi.id },
        data: {
          isActive: true,
          scorecardPillar: PILLAR,
          isReverseKpi: true
        }
      });
    }
  }

  let goal = await prisma.performanceGoal.findFirst({
    where: { title: DEFAULT_GOAL_TITLE },
    include: { kpi: { select: { id: true, name: true } } }
  });

  if (!goal) {
    goal = await prisma.performanceGoal.create({
      data: {
        title: DEFAULT_GOAL_TITLE,
        description:
          "UAT — Turnover rate from payroll Employee roster. Formula: (terminations / (active + terminations)) × 100.",
        type: "company",
        scorecardPillar: PILLAR,
        pillarId: "bsc_learning_growth_hr",
        startDate: new Date("2026-01-01T00:00:00.000Z"),
        endDate: new Date("2026-12-31T23:59:59.999Z"),
        createdById: actor.id,
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
      },
      include: { kpi: { select: { id: true, name: true } } }
    });
  }

  console.log(
    JSON.stringify(
      {
        kpiSummary: {
          id: kpi.id,
          name: kpi.name,
          scorecardPillar: (kpi as any).scorecardPillar ?? null,
          isReverseKpi: (kpi as any).isReverseKpi ?? null
        },
        goalSummary: {
          id: goal.id,
          title: goal.title,
          scorecardPillar: goal.scorecardPillar,
          pillarId: (goal as any).pillarId ?? null,
          formulaType: goal.formulaType,
          targetValue: goal.targetValue?.toString?.() ?? String(goal.targetValue ?? null),
          targetOperator: goal.targetOperator,
          kpiId: goal.kpiId
        },
        postman: {
          terminateEmployee: {
            method: "POST",
            path: "/api/payroll/employees/{employeeId}/terminate",
            bodyExample: { reason: "UAT termination" }
          },
          refreshTurnover: {
            method: "POST",
            path: "/api/performance/integration/sync-payroll-turnover-rate",
            bodyExample: { goalId: goal.id }
          },
          viewGoal: {
            method: "GET",
            path: `/api/performance/goals/${goal.id}`
          },
          listLearningGrowthGoals: {
            method: "GET",
            path: "/api/performance/goals?type=company&scorecardPillar=Learning,%20Growth%20%26%20HR"
          }
        }
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

