/**
 * Run all core financial statements via services (no HTTP): Trial Balance, Income Statement,
 * Balance Sheet, Cash Flow — same period + currency as the accounting dashboard.
 *
 * Run: npx ts-node --transpile-only scripts/test-all-financial-statements.ts
 * Env: RECON_PERIOD=MTD|YTD, optional RECON_CURRENCY_ID=cuid
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { AccountingDashboardService } from "../src/services/AccountingDashboardService";
import { IncomeStatementService } from "../src/services/IncomeStatementService";
import { BalanceSheetService } from "../src/services/BalanceSheetService";
import { CashFlowCalculationService } from "../src/services/cashflow/CashFlowCalculationService";
import { TrialBalanceService } from "../src/services/TrialBalanceService";

const EPS = 2;
const NET_COL_EPS = 0.02;

async function main() {
  const period = (process.env.RECON_PERIOD || "MTD").toUpperCase() as "MTD" | "YTD";
  const currencyIdEnv = process.env.RECON_CURRENCY_ID?.trim();

  const currency = currencyIdEnv
    ? await prisma.currency.findUnique({ where: { id: currencyIdEnv } })
    : await prisma.currency.findFirst({ where: { isActive: true } });

  if (!currency) {
    throw new Error("No currency (set RECON_CURRENCY_ID or ensure an active currency exists)");
  }

  console.log("=== All financial statements (services) ===");
  console.log("Currency:", currency.code, currency.id);
  console.log("Period:", period);
  console.log("(Resolving dates via dashboard — you may see IS/BS logs below from that call.)\n");

  const dashboard = await AccountingDashboardService.getDashboardData({
    period,
    benchmark: "LAST_YEAR",
    currencyId: currency.id,
  });
  const { startDate, endDate } = dashboard.period;

  console.log(
    "Date range:",
    startDate.toISOString().split("T")[0],
    "→",
    endDate.toISOString().split("T")[0],
    "\n"
  );

  const failures: string[] = [];
  const check = (name: string, ok: boolean, detail?: string) => {
    const d = detail ? ` (${detail})` : "";
    console.log(`${ok ? "OK" : "FAIL"}  ${name}${d}`);
    if (!ok) failures.push(name + d);
  };

  console.log("--- Trial balance (cumulative through period end, same currency) ---");
  const tb = await TrialBalanceService.generateTrialBalance(
    endDate,
    undefined,
    undefined,
    true,
    false,
    currency.id
  );
  check(
    "TB gross debits = gross credits",
    tb.totals.isBalanced,
    `DR ${tb.totals.totalDebits.toFixed(2)} CR ${tb.totals.totalCredits.toFixed(2)}`
  );
  const netColDelta = Math.abs(tb.totals.netDebitColumnTotal - tb.totals.netCreditColumnTotal);
  check(
    "TB net debit column = net credit column",
    netColDelta <= NET_COL_EPS,
    `netDR ${tb.totals.netDebitColumnTotal.toFixed(2)} netCR ${tb.totals.netCreditColumnTotal.toFixed(2)}`
  );

  console.log("\n--- Income statement (period activity) ---");
  const isStmt = await IncomeStatementService.generateIncomeStatement({
    startDate,
    endDate,
    currencyId: currency.id,
  });
  check(
    "IS net income is finite",
    Number.isFinite(isStmt.totals.netIncome),
    `netIncome=${isStmt.totals.netIncome}`
  );

  console.log("\n--- Balance sheet (as-of period end) ---");
  const bs = await BalanceSheetService.generateBalanceSheet({
    asOfDate: endDate,
    currencyId: currency.id,
  });
  check("BS assets = liabilities + equity", bs.isBalanced, `difference=${bs.difference}`);
  const cashBreakdownSum = bs.assets.cashAndCashEquivalents.breakdown.reduce(
    (s, x) => s + (x.balance || 0),
    0
  );
  check(
    "BS cash total = sum of cash breakdown",
    Math.abs(bs.assets.cashAndCashEquivalents.total - cashBreakdownSum) <= EPS,
    `total=${bs.assets.cashAndCashEquivalents.total} sum=${cashBreakdownSum}`
  );

  console.log("\n--- Cash flow (same period) ---");
  const cf = await new CashFlowCalculationService().generateCashFlowStatement({
    startDate,
    endDate,
    currencyId: currency.id,
  });
  check(
    "CF ending cash = BS cash & equivalents",
    Math.abs(cf.endingCashBalance - bs.assets.cashAndCashEquivalents.total) <= EPS,
    `CF=${cf.endingCashBalance.toFixed(2)} BS=${bs.assets.cashAndCashEquivalents.total.toFixed(2)}`
  );

  await prisma.$disconnect();

  if (failures.length) {
    console.error("\nFAILED:\n", failures.join("\n"));
    process.exit(1);
  }
  console.log("\nAll financial statement checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
