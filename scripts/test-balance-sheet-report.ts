// @ts-nocheck
/**
 * Financial Position – Balance Sheet report
 *
 * Requirement: View the Balance Sheet as of today.
 * Expected: Assets (1000s) are at the top, Liabilities + Equity (2000s, 3000s) are at the bottom.
 *           They balance perfectly (Assets = Liabilities + Equity).
 *
 * Run: npx ts-node scripts/test-balance-sheet-report.ts
 * (Test data is left in place; no cleanup.)
 */
import { BalanceSheetService } from '../src/services/BalanceSheetService';

const failures: string[] = [];
const TOLERANCE = 0.01;

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log('=== Balance Sheet report test (as of today, Assets top, L+E bottom, balanced) ===\n');

  const asOfDate = new Date();
  asOfDate.setHours(23, 59, 59, 999);

  const report = await BalanceSheetService.generateBalanceSheet({
    asOfDate,
    currencyId: undefined // use default / all currencies as per existing behaviour
  });

  // Structure: Assets at top (first in response), Liabilities + Equity at bottom
  const topLevelKeys = Object.keys(report);
  const assetsIndex = topLevelKeys.indexOf('assets');
  const liabilitiesIndex = topLevelKeys.indexOf('liabilities');
  const equityIndex = topLevelKeys.indexOf('equity');

  assert(assetsIndex >= 0, 'Report must have an "assets" section');
  assert(liabilitiesIndex >= 0, 'Report must have a "liabilities" section');
  assert(equityIndex >= 0, 'Report must have an "equity" section');
  assert(
    assetsIndex < liabilitiesIndex && liabilitiesIndex <= equityIndex,
    'Assets (1000s) must appear before Liabilities (2000s) and Equity (3000s)'
  );

  const totalAssets = report.assets?.totalAssets ?? 0;
  const totalLiabilities = report.liabilities?.totalLiabilities ?? 0;
  const totalEquity = report.equity?.total ?? 0;
  const totalLiabilitiesAndEquity = report.totalLiabilitiesAndEquity ?? 0;

  console.log('Balance Sheet (as of today):');
  console.log('  Total Assets (1000s):           ', totalAssets.toFixed(2));
  console.log('  Total Liabilities (2000s):       ', totalLiabilities.toFixed(2));
  console.log('  Total Equity (3000s):             ', totalEquity.toFixed(2));
  console.log('  Total Liabilities + Equity:      ', totalLiabilitiesAndEquity.toFixed(2));
  console.log('  isBalanced:                      ', report.isBalanced);
  console.log('  difference:                      ', (report.difference ?? 0).toFixed(2));

  assert(
    Math.abs(totalAssets - totalLiabilitiesAndEquity) < TOLERANCE,
    `Assets must equal Liabilities + Equity: Assets=${totalAssets}, L+E=${totalLiabilitiesAndEquity}, diff=${(report.difference ?? 0)}`
  );
  assert(
    report.isBalanced === true,
    `Report must be balanced (isBalanced === true), got ${report.isBalanced}`
  );
  assert(
    typeof report.assets?.currentAssets === 'object' || typeof report.assets?.fixedAssets === 'object',
    'Assets section must include current and/or fixed assets structure'
  );

  if (failures.length > 0) {
    console.error('\n❌ FAILED:');
    failures.forEach((f) => console.error('  -', f));
    process.exit(1);
  }

  console.log('\n✅ PASSED: Balance Sheet as of today has Assets at top, Liabilities + Equity at bottom, and they balance perfectly.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
