// @ts-nocheck
/**
 * Accounting Equation integrity
 *
 * Global check: sum(Assets), sum(Liabilities), sum(Equity).
 * Verifies: Assets - Liabilities - Equity = 0 (i.e. Assets = Liabilities + Equity).
 *
 * Run: npx ts-node scripts/test-accounting-equation-integrity.ts
 */
import { prisma } from '../src/utils/database';
import { BalanceSheetService } from '../src/services/BalanceSheetService';

async function main() {
  console.log('========== Accounting Equation Integrity ==========\n');

  const asOfDate = new Date();
  asOfDate.setHours(23, 59, 59, 999);

  const data = await BalanceSheetService.generateBalanceSheet({
    asOfDate,
    startDate: new Date(0),
    endDate: asOfDate
  });

  const totalAssets = data.assets.totalAssets;
  const totalLiabilities = data.liabilities.totalLiabilities;
  const totalEquity = data.equity.total;

  // Equation: Assets = Liabilities + Equity  =>  Assets - Liabilities - Equity = 0
  const equationLhs = totalAssets - totalLiabilities - totalEquity;
  const tolerance = 0.01;
  const passes = Math.abs(equationLhs) < tolerance;

  console.log('\n========== Global check ==========');
  console.log('  sum(Assets)       =', totalAssets.toFixed(2));
  console.log('  sum(Liabilities)  =', totalLiabilities.toFixed(2));
  console.log('  sum(Equity)       =', totalEquity.toFixed(2));
  console.log('  Assets - L - E    =', equationLhs.toFixed(2));
  console.log('');
  if (passes) {
    console.log('  Result: Equation maintained (Assets - Liabilities - Equity = 0).');
  } else {
    console.log('  Result: FAIL – Equation not maintained. Difference:', equationLhs.toFixed(2));
  }
  console.log('====================================\n');

  await prisma.$disconnect();

  if (!passes) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
