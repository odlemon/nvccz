import { prisma } from "../src/utils/database";
import { RollupCalculationService } from "../src/services/RollupCalculationService";

async function main() {
  const g = await prisma.performanceGoal.findFirst({
    where: { title: { contains: "Finance: Contribution to PAYROLL" } },
    select: { id: true, title: true }
  });
  if (!g) {
    console.log("Finance payroll goal not found");
    return;
  }
  const r = await RollupCalculationService.calculateGoalRollup(g.id);
  console.log("Goal:", g.title);
  console.log("Overall progress:", r.rollup.overallProgressPercentage);
  console.log(
    "Dept breakdown:",
    r.rollup.departmentBreakdown.map((d: any) => ({
      title: d.title,
      target: d.targetValue,
      current: d.currentValue,
      progress: d.progressPercentage
    }))
  );
  console.log(
    "Individual:",
    r.rollup.individualBreakdown.map((i: any) => ({
      title: i.title,
      progress: i.progressPercentage
    }))
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
