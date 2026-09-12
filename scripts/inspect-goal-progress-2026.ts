import "dotenv/config";
import { prisma } from "../src/utils/database";
import { computeGoalProgress, resolveStoredGoalActual } from "../src/services/performanceScorecardSupport";

async function main() {
  const periodStart = new Date(Date.UTC(2026, 0, 1));
  const periodEnd = new Date(Date.UTC(2026, 11, 31, 23, 59, 59, 999));

  const goals = await prisma.performanceGoal.findMany({
    where: {
      endDate: { gte: periodStart },
      startDate: { lte: periodEnd }
    },
    orderBy: [{ type: "asc" }, { title: "asc" }]
  });

  console.log(`Goals in 2026 window: ${goals.length}\n`);

  const mismatches: string[] = [];
  for (const g of goals) {
    const stored = resolveStoredGoalActual(g);
    const target = Number(g.preciseTargetValue ?? g.targetValue ?? 0);
    const achieved = stored.value;
    const dbPct = Number(g.progressPercentage ?? 0);
    const computed = computeGoalProgress({
      actualValue: achieved,
      targetValue: target,
      isReverseKpi: g.isReverseKpi
    });
    const line = [
      g.type.padEnd(11),
      `dbPct=${dbPct}%`,
      `computed=${computed.progressPct}%`,
      `achieved=${achieved}`,
      `target=${target}`,
      (g.title || "").slice(0, 55)
    ].join(" | ");
    console.log(line);
    if (target > 0 && achieved > 0 && dbPct === 0 && computed.progressPct > 0) {
      mismatches.push(g.id);
    }
  }

  if (mismatches.length) {
    console.log(`\nMISMATCH (achieved>0 but progressPercentage=0): ${mismatches.join(", ")}`);
  }
}

main()
  .finally(() => prisma.$disconnect());
