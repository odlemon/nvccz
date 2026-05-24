/**
 * Smoke-test KPI analytics for May 2026 (goal-first current values).
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
        (row.accountingCurrentValue != null
          ? ` ledger=${row.accountingCurrentValue}`
          : "") +
        (row.accountingProgressPercentage
          ? ` accountingProgress=${row.accountingProgressPercentage}%`
          : "")
    );
    console.log(
      `  completionRate=${row.completionRate}% goalsTargetMet=${row.goalsTargetMet}/${row.totalGoals}` +
        (row.syncStatus ? ` syncStatus=${row.syncStatus}` : "")
    );
  }

  console.log(`\nSummary averageProgress (KPIs with goals only): ${result.summary.averageProgress}%`);

  const revenue = pick("Total Revenue");
  const payroll = pick("Payroll Expense");

  console.log("\nAssertions:");
  if (revenue && revenue.totalGoals > 0) {
    if (revenue.sourceCurrentValue !== "performance_goals") {
      throw new Error(`Revenue sourceCurrentValue expected performance_goals, got ${revenue.sourceCurrentValue}`);
    }
  console.log("  ✓ Total Revenue sourceCurrentValue=performance_goals");
    if (
      revenue.accountingCurrentValue != null &&
      revenue.totalCurrentValue >= revenue.accountingCurrentValue &&
      revenue.totalCurrentValue > 0 &&
      revenue.syncStatus === "pending"
    ) {
      throw new Error("Unsynced revenue should not show goal current >= ledger when sync pending");
    }
    if (revenue.syncStatus === "pending" && revenue.totalCurrentValue !== 0) {
      console.warn(`  ⚠ Revenue syncStatus=pending but totalCurrentValue=${revenue.totalCurrentValue}`);
    } else {
      console.log(`  ✓ Total Revenue goal current=${revenue.totalCurrentValue} (ledger=${revenue.accountingCurrentValue ?? "n/a"})`);
    }
  }

  if (payroll && payroll.totalGoals > 0) {
    if (payroll.sourceCurrentValue !== "performance_goals") {
      throw new Error(`Payroll sourceCurrentValue expected performance_goals, got ${payroll.sourceCurrentValue}`);
    }
    if (payroll.totalCurrentValue === payroll.accountingCurrentValue && payroll.accountingCurrentValue != null) {
      throw new Error("Payroll totalCurrentValue should come from company goal, not GL ledger");
    }
    console.log(
      `  ✓ Payroll goal current=${payroll.totalCurrentValue} (ledger=${payroll.accountingCurrentValue ?? "n/a"})`
    );
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
