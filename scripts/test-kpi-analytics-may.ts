/**
 * Smoke-test KPI analytics for May 2026 (reverse expense + revenue cap).
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/test-kpi-analytics-may.ts
 */
import { PerformanceAnalyticsService } from "../src/services/PerformanceAnalyticsService";
import { prisma } from "../src/utils/database";

async function main() {
  const start = new Date("2026-05-01T00:00:00.000Z");
  const end = new Date("2026-05-31T23:59:59.999Z");
  const result = await PerformanceAnalyticsService.getKPIAnalysis(undefined, undefined, {
    start,
    end
  });

  const pick = (name: string) =>
    result.kpiAnalytics.find((k: any) =>
      String(k.kpi?.name || "").toLowerCase().includes(name.toLowerCase())
    );

  for (const label of [
    "Total Revenue",
    "Payroll Expense",
    "Net Profit",
    "Accounts Payable",
    "Operating Expenses"
  ]) {
    const row = pick(label);
    if (!row) {
      console.log(`\n${label}: (no row)`);
      continue;
    }
    console.log(`\n${row.kpi?.name}:`);
    console.log(`  reverse=${row.kpi?.isReverseKpi} accountType=${row.kpi?.accountType}`);
    console.log(`  target=${row.totalTargetValue} current=${row.totalCurrentValue} source=${row.sourceCurrentValue}`);
    console.log(`  progress=${row.progressPercentage}% completionRate=${row.completionRate}%`);
    console.log(`  goals: ${row.completedGoals}/${row.totalGoals} completed`);
  }

  console.log(`\nSummary averageProgress (KPIs with goals only): ${result.summary.averageProgress}%`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
