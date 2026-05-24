/**
 * Smoke-test KPI analytics for May 2026 (goal-average progress vs accounting progress).
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
    console.log(
      `  progress=${row.progressPercentage}% (source=${row.progressSource})` +
        (row.accountingProgressPercentage
          ? ` accountingProgress=${row.accountingProgressPercentage}%`
          : "")
    );
    console.log(
      `  completionRate=${row.completionRate}% goalsTargetMet=${row.goalsTargetMet}/${row.totalGoals}`
    );
    console.log(`  stage completed: ${row.completedGoals}/${row.totalGoals}`);
  }

  console.log(`\nSummary averageProgress (KPIs with goals only): ${result.summary.averageProgress}%`);

  const payroll = pick("Payroll Expense");
  if (payroll && payroll.totalGoals > 0) {
    const goalProgress = parseFloat(payroll.progressPercentage);
    const accountingProgress = payroll.accountingProgressPercentage
      ? parseFloat(payroll.accountingProgressPercentage)
      : null;
    console.log("\nAssertions:");
    if (accountingProgress != null && goalProgress === accountingProgress) {
      console.warn(
        "  ⚠️ Payroll goal progress equals accounting progress — expected separate metrics when GL differs from goals"
      );
    } else {
      console.log("  ✓ Payroll goal progress distinct from accounting GL aggregate (when both present)");
    }
    if (payroll.progressSource !== "goals") {
      throw new Error(`Expected progressSource=goals for Payroll, got ${payroll.progressSource}`);
    }
    console.log("  ✓ progressSource=goals for Payroll Expense");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
