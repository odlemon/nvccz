/**
 * Exercise consolidated balance sheet + income statement (same code paths as HTTP).
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/smoke-consolidated-reports.ts
 *
 * Optional: CONSOLIDATION_CURRENCY_ID=cuid (defaults to first active currency)
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { ConsolidatedReportService } from "../src/services/ConsolidatedReportService";

async function main() {
  const currencyIdEnv = process.env.CONSOLIDATION_CURRENCY_ID?.trim();
  const currency = currencyIdEnv
    ? await prisma.currency.findUnique({ where: { id: currencyIdEnv } })
    : await prisma.currency.findFirst({ where: { isActive: true }, orderBy: { code: "asc" } });

  if (!currency) {
    throw new Error("No currency — set CONSOLIDATION_CURRENCY_ID or ensure active currencies exist");
  }

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const asOf = endOfMonth;

  console.log("consolidation:", currency.code, currency.id);
  console.log("IS range:", startOfMonth.toISOString().slice(0, 10), "→", endOfMonth.toISOString().slice(0, 10));
  console.log("BS asOf:", asOf.toISOString().slice(0, 10), "\n");

  console.log("--- generateConsolidatedBalanceSheet ---");
  const bs = await ConsolidatedReportService.generateConsolidatedBalanceSheet({
    asOfDate: asOf,
    consolidationCurrencyId: currency.id,
    hideZeroBalances: false,
  });
  console.log("OK", {
    totalAssets: bs.assets?.totalAssets,
    totalLiabilitiesAndEquity: bs.totalLiabilitiesAndEquity,
    isBalanced: bs.isBalanced,
    consolidation: bs.consolidationCurrency?.code,
  });

  console.log("\n--- generateConsolidatedIncomeStatement ---");
  const inc = await ConsolidatedReportService.generateConsolidatedIncomeStatement({
    startDate: startOfMonth,
    endDate: endOfMonth,
    consolidationCurrencyId: currency.id,
  });
  console.log("OK", {
    netIncome: inc.totals?.netIncome,
    consolidation: inc.consolidationCurrency?.code,
    exchangeRates: inc.exchangeRates?.length ?? 0,
  });

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("FAIL", e);
  process.exit(1);
});
