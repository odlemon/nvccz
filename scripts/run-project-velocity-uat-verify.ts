/**
 * One-off: complete 3/5 UAT milestone tasks, then read goal + KPI analytics.
 * Run: npx ts-node --transpile-only scripts/run-project-velocity-uat-verify.ts
 */
import "dotenv/config";
import { TaskService } from "../src/services/TaskService";
import { PerformanceAnalyticsService } from "../src/services/PerformanceAnalyticsService";
import { prisma } from "../src/utils/database";
import { parseGoalCurrentAndTarget } from "../src/services/performanceGoalRollupUtils";

const GOAL_ID = "cmog5lut60002unj4atb93eri";
const KPI_ID = "cmog5ltdl0000unj4dgms1lm8";
const TASK_IDS = [
  "cmog5lw5k0004unj443udooqo",
  "cmog5lx7a0006unj44n3p6y7l",
  "cmog5lxwe0008unj466td2n8c"
];

async function main() {
  const actor = await prisma.user.findFirst({ orderBy: { id: "asc" }, include: { role: true } });
  if (!actor) throw new Error("No user");

  await TaskService.bulkUpdateTaskStage(TASK_IDS, "completed", {}, actor.id);

  const goal = await prisma.performanceGoal.findUnique({
    where: { id: GOAL_ID },
    include: { kpi: { select: { id: true, name: true, isReverseKpi: true } } }
  });
  if (!goal) throw new Error("goal missing");

  const { current, target } = parseGoalCurrentAndTarget(goal);
  const analytics = await PerformanceAnalyticsService.getKPIAnalysis(KPI_ID, undefined, undefined, undefined);
  const row = analytics.kpiAnalytics?.find((r: { kpi?: { id?: string } }) => r.kpi?.id === KPI_ID);

  const expected = 60;
  const ok = Math.abs(current - expected) < 0.1;

  console.log(
    JSON.stringify(
      {
        expectedCompletionPct: expected,
        goal: {
          id: goal.id,
          currentValue: goal.currentValue,
          preciseCurrentValue: goal.preciseCurrentValue,
          progressPercentage: goal.progressPercentage
        },
        parsed: { current, target },
        kpiAnalytics: row
          ? {
              totalCurrentValue: row.totalCurrentValue,
              progressPercentage: row.progressPercentage,
              sourceCurrentValue: row.sourceCurrentValue
            }
          : null,
        pass: ok
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  void prisma.$disconnect();
  process.exit(1);
});
