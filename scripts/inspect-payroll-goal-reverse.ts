/**
 * Inspect PAYROLL goal reverse-KPI state vs expected progress.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/inspect-payroll-goal-reverse.ts
 */
import { prisma } from "../src/utils/database";
import {
  computeAchievementPercent,
  isTargetMet,
  resolveReverseScoring
} from "../src/services/performanceGoalRollupUtils";

async function main() {
  const goals = await prisma.performanceGoal.findMany({
    where: {
      OR: [
        { title: { contains: "PAYROLL" } },
        { title: { contains: "Payroll" } },
        { kpi: { code: "PAYROLL_EXPENSE" } },
        { kpi: { name: { contains: "Payroll" } } }
      ]
    },
    include: {
      kpi: {
        select: {
          id: true,
          name: true,
          code: true,
          isReverseKpi: true,
          accountType: true
        }
      }
    }
  });

  console.log(`Found ${goals.length} payroll-related goal(s)\n`);

  for (const g of goals) {
    const target = parseFloat(String(g.targetValue || 0));
    const current = parseFloat(String(g.currentValue || 0));
    const storedPct = parseFloat(String(g.progressPercentage || 0));
    const correctPct = computeAchievementPercent(g);
    const correctMet = isTargetMet(current, target, g.targetOperator, g.isReverseKpi);
    const reverse = resolveReverseScoring(g);

    console.log(`Goal: "${g.title}" (${g.id})`);
    console.log(`  type=${g.type} stage=${g.stage} status=${g.status}`);
    console.log(`  target=$${target} current=$${current}`);
    console.log(`  monetaryValue=$${g.monetaryValue} achieved=$${g.monetaryValueAchieved}`);
    console.log(`  isReverseKpi=${g.isReverseKpi} targetOperator=${g.targetOperator} resolveReverse=${reverse}`);
    console.log(`  KPI: ${g.kpi?.name} code=${g.kpi?.code} kpi.isReverseKpi=${g.kpi?.isReverseKpi}`);
    console.log(`  STORED progress=${storedPct}% | CORRECT progress=${correctPct.toFixed(2)}%`);
    console.log(`  STORED completed=${g.stage === "completed"} | CORRECT targetMet=${correctMet}`);
    console.log("");
  }

  const kpi = await prisma.kPI.findFirst({
    where: { OR: [{ code: "PAYROLL_EXPENSE" }, { name: "Payroll Expense" }] }
  });
  if (kpi) {
    console.log("Payroll Expense KPI:", {
      id: kpi.id,
      isReverseKpi: kpi.isReverseKpi,
      accountType: kpi.accountType,
      targetOperator: (kpi as any).targetOperator
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
