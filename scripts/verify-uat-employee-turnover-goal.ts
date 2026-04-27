/**
 * Verify UAT turnover after terminations:
 * - recompute expected turnover from Employee table (terminated vs active roster)
 * - compare to performance goal + KPI analytics
 *
 * Run: npx ts-node --transpile-only scripts/verify-uat-employee-turnover-goal.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { DataIntegrationService } from "../src/services/DataIntegrationService";
import { PerformanceAnalyticsService } from "../src/services/PerformanceAnalyticsService";
import { parseGoalCurrentAndTarget, computeKpiLineProgressPercent } from "../src/services/performanceGoalRollupUtils";

const GOAL_ID = process.env.UAT_TURNOVER_GOAL_ID?.trim() || "cmog4p3830001unv4zux4w2sg";
const KPI_ID = process.env.UAT_TURNOVER_KPI_ID?.trim() || "cmnjwm5s40000un5ocbnymmid";

async function main() {
  const metrics = await DataIntegrationService.calculatePayrollEmployeeTurnoverMetrics();

  const goal = await prisma.performanceGoal.findUnique({
    where: { id: GOAL_ID },
    include: {
      kpi: {
        select: { id: true, name: true, isReverseKpi: true, unitSymbol: true, unitPosition: true }
      }
    }
  });
  if (!goal) throw new Error(`Goal not found: ${GOAL_ID}`);

  const { current, target } = parseGoalCurrentAndTarget(goal);
  const goalPct = computeKpiLineProgressPercent([goal], goal.kpi);

  const analytics = await PerformanceAnalyticsService.getKPIAnalysis(KPI_ID, undefined, undefined, undefined);
  const row =
    analytics.kpiAnalytics?.find((r: any) => r.kpi?.id === KPI_ID) ||
    analytics.kpiAnalytics?.find((r: any) => String(r.kpi?.name || "").toLowerCase().includes("turnover"));

  const expectedPct = metrics.turnoverRatePct;
  const storedPrecise = Number(goal.preciseCurrentValue ?? 0);
  const storedLegacy = Number(goal.currentValue ?? 0);
  const tol = 0.02;

  const matches =
    Math.abs(storedPrecise - expectedPct) <= tol || Math.abs(storedLegacy - expectedPct) <= tol;

  console.log(
    JSON.stringify(
      {
        payrollSourceMetrics: metrics,
        expectedTurnoverRatePct: expectedPct,
        goal: {
          id: goal.id,
          title: goal.title,
          scorecardPillar: goal.scorecardPillar,
          formulaType: goal.formulaType,
          targetOperator: goal.targetOperator,
          isReverseKpi: goal.isReverseKpi,
          kpi: goal.kpi,
          stored: {
            currentValue: goal.currentValue,
            preciseCurrentValue: goal.preciseCurrentValue,
            progressPercentage: goal.progressPercentage,
            lastSyncedValue: goal.lastSyncedValue,
            lastSyncedAt: goal.lastSyncedAt
          },
          parsed: { current, target },
          computedProgressPercentSingleGoal: Number(goalPct.toFixed(2))
        },
        kpiAnalyticsRow: row
          ? {
              kpi: row.kpi,
              totalGoals: row.totalGoals,
              totalTargetValue: row.totalTargetValue,
              totalCurrentValue: row.totalCurrentValue,
              sourceCurrentValue: row.sourceCurrentValue,
              progressPercentage: row.progressPercentage,
              completionRate: row.completionRate
            }
          : null,
        checks: {
          goalValueMatchesPayrollFormula: matches,
          formula: "(Terminations / (Active + Terminations)) * 100",
          activeHeadcount: metrics.activeHeadcount,
          terminatedCount: metrics.terminatedCount
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

