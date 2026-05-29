/**
 * Backfill progressPercentage (and stage) when achieved > 0 but DB progress is 0.
 * Fixes goals created via raw Prisma (e.g. HDF scripts) without deriveGoalProgressState.
 *
 * Usage: npx ts-node --transpile-only -r dotenv/config scripts/sync-goal-progress-percentage-2026.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { resolveStoredGoalActual } from "../src/services/performanceScorecardSupport";
import { deriveGoalProgressState } from "../src/services/performanceGoalRollupUtils";

const YEAR = parseInt(process.env.DEPT_YEAR || process.env.HDF_YEAR || "2026", 10);

async function main() {
  const periodStart = new Date(Date.UTC(YEAR, 0, 1));
  const periodEnd = new Date(Date.UTC(YEAR, 11, 31, 23, 59, 59, 999));

  const goals = await prisma.performanceGoal.findMany({
    where: {
      startDate: { lte: periodEnd },
      endDate: { gte: periodStart }
    }
  });

  let updated = 0;
  for (const g of goals) {
    const achieved = resolveStoredGoalActual(g).value;
    const target = Number(g.preciseTargetValue ?? g.targetValue ?? 0);
    const dbPct = Number(g.progressPercentage ?? 0);
    const state = deriveGoalProgressState({
      currentValue: achieved,
      targetValue: target,
      targetOperator: g.targetOperator,
      isReverseKpi: g.isReverseKpi,
      previousStage: g.stage
    });
    const expectedPct = state.progressPercentageNum;
    if (target <= 0 && achieved <= 0) continue;
    if (Math.abs(dbPct - expectedPct) < 0.05) continue;

    await prisma.performanceGoal.update({
      where: { id: g.id },
      data: {
        progressPercentage: state.progressPercentage,
        stage: state.stage,
        status: state.status,
        preciseCurrentValue: String(achieved),
        currentValue: achieved
      }
    });
    updated++;
    console.log(
      `Updated ${g.type} "${g.title}": progress ${dbPct}% → ${state.progressPercentage}% (achieved ${achieved}/${target})`
    );
  }

  console.log(`\nDone. ${updated} goal(s) updated.`);
}

main()
  .finally(() => prisma.$disconnect());
