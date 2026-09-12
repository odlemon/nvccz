// @ts-nocheck
/**
 * Comparative Reporting – P&L This Month vs Last Month with variance column
 *
 * Requirement: Run a P&L comparing "This Month" vs "Last Month".
 * Expected: System displays two columns with a variance column showing the dollar and percentage change.
 *
 * Run: npx ts-node scripts/test-comparative-pnl-this-month-vs-last-month.ts
 * (Test data is left in place; no cleanup.)
 */
import { IncomeStatementService } from "../src/services/IncomeStatementService";

const failures: string[] = [];
const TOLERANCE = 0.01;

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log("=== Comparative P&L (This Month vs Last Month) – two columns + variance ===\n");

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

  const periods = [
    { startDate: lastMonthStart, endDate: lastMonthEnd },
    { startDate: thisMonthStart, endDate: thisMonthEnd }
  ];
  const data = await IncomeStatementService.getComparativeIncomeStatement(
    periods,
    ["Last Month", "This Month"]
  );

  assert(Array.isArray(data.periods) && data.periods.length === 2, "Response must have two period columns");
  assert(
    data.periods[0].label === "Last Month" && data.periods[1].label === "This Month",
    "Periods must be labeled 'Last Month' and 'This Month'"
  );

  const col0 = data.periods[0];
  const col1 = data.periods[1];
  assert(typeof col0.revenue === "number" && typeof col1.revenue === "number", "Both columns must have revenue");
  assert(typeof col0.expenses === "number" && typeof col1.expenses === "number", "Both columns must have expenses");
  assert(typeof col0.netIncome === "number" && typeof col1.netIncome === "number", "Both columns must have netIncome");

  assert(!!data.variance, "Response must include a variance object (dollar and percentage change)");
  if (data.variance) {
    assert(
      typeof data.variance.revenue?.dollarChange === "number" && typeof data.variance.revenue?.percentChange === "number",
      "Variance must have revenue.dollarChange and revenue.percentChange"
    );
    assert(
      typeof data.variance.expenses?.dollarChange === "number" && typeof data.variance.expenses?.percentChange === "number",
      "Variance must have expenses.dollarChange and expenses.percentChange"
    );
    assert(
      typeof data.variance.netIncome?.dollarChange === "number" && typeof data.variance.netIncome?.percentChange === "number",
      "Variance must have netIncome.dollarChange and netIncome.percentChange"
    );

    const revDollar = col1.revenue - col0.revenue;
    const expDollar = col1.expenses - col0.expenses;
    const niDollar = col1.netIncome - col0.netIncome;
    assert(
      Math.abs(data.variance.revenue.dollarChange - revDollar) < TOLERANCE,
      `Variance revenue dollar should be This Month - Last Month: expected ${revDollar}, got ${data.variance.revenue.dollarChange}`
    );
    assert(
      Math.abs(data.variance.expenses.dollarChange - expDollar) < TOLERANCE,
      `Variance expenses dollar should be This Month - Last Month: expected ${expDollar}, got ${data.variance.expenses.dollarChange}`
    );
    assert(
      Math.abs(data.variance.netIncome.dollarChange - niDollar) < TOLERANCE,
      `Variance netIncome dollar should be This Month - Last Month: expected ${niDollar}, got ${data.variance.netIncome.dollarChange}`
    );
  }

  assert(Array.isArray(data.lineItems), "Response must include lineItems for two-column + variance display");
  if (data.lineItems && data.lineItems.length > 0) {
    const first = data.lineItems[0];
    assert(
      "amountPeriod0" in first && "amountPeriod1" in first && "varianceDollar" in first && "variancePercent" in first,
      "Each lineItem must have amountPeriod0, amountPeriod1, varianceDollar, variancePercent"
    );
  }

  console.log("Periods (two columns):");
  console.log("  Last Month:", col0.period?.startDate, "–", col0.period?.endDate, "| Revenue:", col0.revenue, "Expenses:", col0.expenses, "Net:", col0.netIncome);
  console.log("  This Month:", col1.period?.startDate, "–", col1.period?.endDate, "| Revenue:", col1.revenue, "Expenses:", col1.expenses, "Net:", col1.netIncome);
  console.log("Variance (dollar and %):");
  console.log("  Revenue:  ", data.variance?.revenue?.dollarChange, "(", data.variance?.revenue?.percentChange, "%)");
  console.log("  Expenses: ", data.variance?.expenses?.dollarChange, "(", data.variance?.expenses?.percentChange, "%)");
  console.log("  Net Income:", data.variance?.netIncome?.dollarChange, "(", data.variance?.netIncome?.percentChange, "%)");
  console.log("Line items count:", data.lineItems?.length ?? 0);

  if (failures.length > 0) {
    console.error("\n❌ FAILED:");
    failures.forEach((f) => console.error("  -", f));
    process.exit(1);
  }

  console.log("\n✅ PASSED: P&L compares This Month vs Last Month with two columns and variance (dollar and percentage change).");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
