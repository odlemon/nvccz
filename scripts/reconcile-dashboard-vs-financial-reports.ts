/**
 * Reconcile Accounting Dashboard vs Income Statement, Balance Sheet, and Cash Flow (same currency + period).
 *
 * Run: npx ts-node --transpile-only scripts/reconcile-dashboard-vs-financial-reports.ts
 * Env: optional RECON_PERIOD=MTD|YTD, RECON_CURRENCY_ID=cuid
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { AccountingDashboardService } from "../src/services/AccountingDashboardService";
import { IncomeStatementService } from "../src/services/IncomeStatementService";
import { BalanceSheetService } from "../src/services/BalanceSheetService";
import { CashFlowCalculationService } from "../src/services/cashflow/CashFlowCalculationService";

const EPS = 2; // allow small float / rounding drift ($2)

function near(a: number, b: number): boolean {
  return Math.abs(a - b) <= EPS;
}

async function main() {
  const period = (process.env.RECON_PERIOD || "MTD").toUpperCase() as "MTD" | "YTD";
  const currencyIdEnv = process.env.RECON_CURRENCY_ID?.trim();

  const currency = currencyIdEnv
    ? await prisma.currency.findUnique({ where: { id: currencyIdEnv } })
    : await prisma.currency.findFirst({ where: { isActive: true } });

  if (!currency) {
    throw new Error("No currency (set RECON_CURRENCY_ID or seed an active currency)");
  }

  console.log("=== Dashboard vs financial reports ===");
  console.log("Currency:", currency.code, currency.id);
  console.log("Period mode:", period);
  console.log("");

  const dashboard = await AccountingDashboardService.getDashboardData({
    period,
    benchmark: "LAST_YEAR",
    currencyId: currency.id,
  });

  const { startDate, endDate } = dashboard.period;

  const [isStmt, bs, cfSvc] = await Promise.all([
    IncomeStatementService.generateIncomeStatement({
      startDate,
      endDate,
      currencyId: currency.id,
    }),
    BalanceSheetService.generateBalanceSheet({
      asOfDate: endDate,
      currencyId: currency.id,
    }),
    Promise.resolve(new CashFlowCalculationService()),
  ]);

  const cf = await cfSvc.generateCashFlowStatement({
    startDate,
    endDate,
    currencyId: currency.id,
  });

  const cogsDirect = await AccountingDashboardService.calculateCOGS(
    startDate,
    endDate,
    currency.id
  );

  const failures: string[] = [];

  const check = (name: string, a: number, b: number) => {
    const ok = near(a, b);
    console.log(`${ok ? "OK" : "FAIL"}  ${name}: dashboard/source=${a.toFixed(2)} vs report=${b.toFixed(2)} (Δ ${(a - b).toFixed(2)})`);
    if (!ok) failures.push(`${name}: ${a} vs ${b}`);
  };

  console.log("--- Income statement (period activity) ---");
  check("Revenue", dashboard.metrics.revenue.value, isStmt.sections.revenue.total);
  check("Net income", dashboard.metrics.netProfit.value, isStmt.totals.netIncome);
  check("COGS (dashboard metric vs calculateCOGS)", dashboard.metrics.cogs.value, cogsDirect);
  check(
    "Gross profit (revenue - COGS vs dashboard)",
    isStmt.sections.revenue.total - cogsDirect,
    dashboard.metrics.grossProfit.value
  );

  console.log("\n--- Balance sheet (as-of period end) ---");
  check("Total assets", dashboard.assets.total, bs.assets.totalAssets);
  check(
    "Liability + equity",
    dashboard.liabilitiesEquity.total,
    bs.totalLiabilitiesAndEquity
  );
  check(
    "Cash & equivalents (BS)",
    bs.assets.cashAndCashEquivalents.total,
    bs.assets.cashAndCashEquivalents.breakdown.reduce((s, x) => s + (x.balance || 0), 0)
  );

  console.log("\n--- Cash flow vs balance sheet cash (point-in-time) ---");
  check("CF ending cash vs BS cash & equivalents total", cf.endingCashBalance, bs.assets.cashAndCashEquivalents.total);

  console.log("\n--- Monthly chart roll-up (single / multi month) ---");
  const sumMonthlyRev = dashboard.monthlyData.reduce((s, m) => s + m.revenue, 0);
  check("Sum monthly revenue vs IS revenue", sumMonthlyRev, isStmt.sections.revenue.total);

  const sumMonthlyNet = dashboard.monthlyData.reduce((s, m) => s + m.netProfit, 0);
  check("Sum monthly net profit vs IS net income", sumMonthlyNet, isStmt.totals.netIncome);

  console.log("\n--- Expense breakdown (dashboard only shows positive lines) ---");
  const expSum = dashboard.expenses.reduce((s, e) => s + e.amount, 0);
  const isOpExPositive = isStmt.sections.operatingExpenses.accounts
    .filter((a) => a.netAmount > 0)
    .reduce((s, a) => s + a.netAmount, 0);
  check("Sum dashboard expense lines vs IS op.ex (positive accounts only)", expSum, isOpExPositive);

  await prisma.$disconnect();

  if (failures.length) {
    console.error("\nFAILED checks:\n", failures.join("\n"));
    process.exit(1);
  }
  console.log("\nAll checks passed (within $" + EPS + ").");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
