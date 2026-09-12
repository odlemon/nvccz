/**
 * Recompute progressPercentage, stage, and status from stored current/target values.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/backfill-goal-stages-from-progress.ts
 */
import { prisma } from "../src/utils/database";
import { deriveGoalProgressState } from "../src/services/performanceGoalRollupUtils";

async function main() {
  const goals = await prisma.performanceGoal.findMany({
    where: {
      status: { in: ["active", "completed", "in_progress"] },
      targetValue: { not: null }
    },
    select: {
      id: true,
      title: true,
      currentValue: true,
      targetValue: true,
      targetOperator: true,
      isReverseKpi: true,
      progressPercentage: true,
      stage: true,
      status: true
    }
  });

  let updated = 0;
  for (const goal of goals) {
    const current = goal.currentValue != null ? parseFloat(String(goal.currentValue)) : 0;
    const state = deriveGoalProgressState({
      currentValue: Number.isFinite(current) ? current : 0,
      targetValue: goal.targetValue,
      targetOperator: goal.targetOperator,
      isReverseKpi: goal.isReverseKpi,
      previousStage: goal.stage,
      progressPercentage: goal.progressPercentage
    });

    const prevProgress = String(goal.progressPercentage ?? "");
    const changed =
      prevProgress !== state.progressPercentage ||
      goal.stage !== state.stage ||
      goal.status !== state.status;

    if (!changed) continue;

    await prisma.performanceGoal.update({
      where: { id: goal.id },
      data: {
        progressPercentage: state.progressPercentage,
        stage: state.stage,
        status: state.status,
        updatedAt: new Date()
      }
    });
    updated += 1;
    console.log(
      `✅ ${goal.title}: ${prevProgress}%/${goal.stage} → ${state.progressPercentage}%/${state.stage}`
    );
  }

  console.log(`\nDone. Updated ${updated} of ${goals.length} goal(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
