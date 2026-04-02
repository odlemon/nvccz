/**
 * KPI reverse/non-reverse classification (DB script)
 *
 * Classifies all KPIs by name + hardcoded KPI metadata and updates linked goals:
 * - reverse => performance_goals.isReverseKpi = true, targetOperator = "<="
 * - normal  => performance_goals.isReverseKpi = false, targetOperator = ">="
 *
 * Usage:
 *   npm run db:classify:kpi-reverse
 *   npm run db:classify:kpi-reverse -- --dry-run
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { HARDCODED_KPIS } from "../src/config/hardcodedKPIs";

const prisma = new PrismaClient();

const REVERSE_HINTS = [
  "cost",
  "expense",
  "liabil",
  "outstanding",
  "arrears",
  "payable",
  "overdue",
  "variance",
  "utilisation",
  "utilization",
  "days sales outstanding",
  "dso",
  "risk",
  "loss",
  "spend"
];

function classifyKpi(name: string, hardcodedAccountType?: string | null): {
  isReverse: boolean;
  reason: string;
} {
  const n = String(name || "").toLowerCase();
  if (hardcodedAccountType && hardcodedAccountType.toLowerCase() === "expense") {
    return { isReverse: true, reason: "hardcoded accountType=Expense" };
  }
  if (hardcodedAccountType && hardcodedAccountType.toLowerCase() === "liability") {
    return { isReverse: true, reason: "hardcoded accountType=Liability" };
  }
  if (REVERSE_HINTS.some((hint) => n.includes(hint))) {
    return { isReverse: true, reason: "name keyword heuristic" };
  }
  return { isReverse: false, reason: "default normal KPI" };
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const kpis = await prisma.kPI.findMany({
    select: { id: true, name: true }
  });

  const hardcodedByName = new Map(
    HARDCODED_KPIS.map((k) => [String(k.name || "").toLowerCase().trim(), k])
  );

  const results: Array<{
    kpiId: string;
    name: string;
    isReverse: boolean;
    reason: string;
    linkedGoalCount: number;
    updatedGoalCount: number;
  }> = [];

  for (const kpi of kpis) {
    const matched = hardcodedByName.get(String(kpi.name || "").toLowerCase().trim());
    const cls = classifyKpi(kpi.name, matched?.accountType || null);

    const linkedGoalCount = await prisma.performanceGoal.count({
      where: { kpiId: kpi.id }
    });

    let updatedGoalCount = 0;
    if (!dryRun) {
      const updated = await prisma.performanceGoal.updateMany({
        where: {
          kpiId: kpi.id
        },
        data: {
          isReverseKpi: cls.isReverse,
          targetOperator: cls.isReverse ? "<=" : ">="
        }
      });
      updatedGoalCount = updated.count;
    }

    results.push({
      kpiId: kpi.id,
      name: kpi.name,
      isReverse: cls.isReverse,
      reason: cls.reason,
      linkedGoalCount,
      updatedGoalCount
    });
  }

  const summary = {
    success: true,
    dryRun,
    totals: {
      totalKpis: results.length,
      reverseKpis: results.filter((r) => r.isReverse).length,
      normalKpis: results.filter((r) => !r.isReverse).length,
      totalLinkedGoals: results.reduce((sum, r) => sum + r.linkedGoalCount, 0),
      totalUpdatedGoals: results.reduce((sum, r) => sum + r.updatedGoalCount, 0)
    },
    sample: results.slice(0, 25)
  };

  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error("KPI_REVERSE_CLASSIFICATION_FAILED", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

