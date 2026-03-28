/**
 * UAT: Cash position should match sum of Current Asset GL 1100–1199 (same basis as Balance Sheet cash bucket).
 *
 * Run: npx ts-node --transpile-only scripts/verify-dashboard-cash-1100-1199.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";
import { BalanceSheetService } from "../src/services/BalanceSheetService";

async function main() {
  const currency = await prisma.currency.findFirst({ where: { isActive: true } });
  const asOf = new Date();
  asOf.setHours(23, 59, 59, 999);

  const bs = await BalanceSheetService.generateBalanceSheet({
    asOfDate: asOf,
    currencyId: currency?.id
  });

  const breakdown = bs.assets.cashAndCashEquivalents.breakdown || [];
  const breakdownSum = breakdown.reduce((s, a) => s + (a.balance || 0), 0);
  const reportedTotal = bs.assets.cashAndCashEquivalents.total;
  const internalOk = Math.abs(breakdownSum - reportedTotal) < 0.02;

  const inRange = (no: string) => no >= "1100" && no <= "1199";
  const dupInCurrentAssets = (bs.assets.currentAssets.accounts || []).filter((a) => inRange(a.accountNo));
  const noDupCashInCurrent = dupInCurrentAssets.length === 0;

  console.log("Cash & equivalents (Balance Sheet / dashboard source)");
  console.log("  reported total:", reportedTotal);
  console.log("  sum(breakdown):", breakdownSum);
  console.log("  internal total vs breakdown:", internalOk ? "OK" : "MISMATCH");
  console.log("  1100–1199 rows in currentAssets (should be 0 — avoid double count):", dupInCurrentAssets.length);
  if (!noDupCashInCurrent) {
    console.log("    ", dupInCurrentAssets.map((x) => x.accountNo).join(", "));
  }

  await prisma.$disconnect();
  process.exit(internalOk && noDupCashInCurrent ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
