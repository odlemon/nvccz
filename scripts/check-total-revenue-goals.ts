import { prisma } from "../src/utils/database";
import { parseGoalCurrentAndTarget, isTargetMet } from "../src/services/performanceGoalRollupUtils";

async function main() {
  const kpi = await prisma.kPI.findFirst({
    where: { code: "TOTAL_REVENUE" },
    select: { id: true, name: true }
  });
  if (!kpi) {
    console.log("No TOTAL_REVENUE KPI found");
    return;
  }

  const goals = await prisma.performanceGoal.findMany({
    where: { kpiId: kpi.id },
    select: {
      id: true,
      title: true,
      type: true,
      targetValue: true,
      currentValue: true,
      progressPercentage: true,
      stage: true,
      status: true,
      targetOperator: true,
      isReverseKpi: true,
      syncConfig: true
    },
    orderBy: { type: "asc" }
  });

  console.log(`\nKPI: ${kpi.name} (${kpi.id})\n`);
  for (const g of goals) {
    const { current, target } = parseGoalCurrentAndTarget(g);
    const met = isTargetMet(current, target, g.targetOperator, g.isReverseKpi);
    console.log(`--- ${g.title} (${g.type})`);
    console.log(`  target=${g.targetValue} current=${g.currentValue} progress=${g.progressPercentage}%`);
    console.log(`  stage=${g.stage} status=${g.status} targetMet=${met}`);
    console.log(`  syncConfig=${JSON.stringify(g.syncConfig)}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
