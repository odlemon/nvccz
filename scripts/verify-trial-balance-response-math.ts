/**
 * Reconcile trial balance JSON: row sums vs totals, and line sums vs gross totals.
 * Same logic as GET /api/accounting/trial-balance (TrialBalanceService).
 *
 * Usage (from repo root, .env with DATABASE_URL):
 *   npx ts-node --transpile-only scripts/verify-trial-balance-response-math.ts
 *
 * Env:
 *   TB_PERIOD=2026-03
 *   TB_CURRENCY_ID=cmh3bymy70000una4yk8leusu   (optional; omit for all currencies on JEs)
 *   TB_HIDE_ZERO=0|1
 */
import 'dotenv/config';
import { TrialBalanceService } from '../src/services/TrialBalanceService';
import { parsePeriodToDateRange } from '../src/utils/periodFilterHelper';

const EPS = 0.02;

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < EPS;
}

async function main() {
  const period = process.env.TB_PERIOD || '2026-03';
  const currencyId = process.env.TB_CURRENCY_ID?.trim() || undefined;
  const hideZero = process.env.TB_HIDE_ZERO === '1' || process.env.TB_HIDE_ZERO === 'true';

  const { startDate, endDate } = parsePeriodToDateRange('month', period);

  console.log('Trial balance response math check');
  console.log('  period:', period, '| currencyId:', currencyId ?? '(any)', '| hideZeroBalances:', hideZero);
  console.log('  range:', startDate.toISOString(), '→', endDate.toISOString());
  console.log('');

  const tb = await TrialBalanceService.generateTrialBalance(
    endDate,
    startDate,
    endDate,
    hideZero,
    true,
    currencyId
  );

  const { totals } = tb;
  let sumRowDebit = 0;
  let sumRowCredit = 0;
  let sumLineDebit = 0;
  let sumLineCredit = 0;
  let accountsWithLines = 0;

  for (const a of tb.accounts) {
    sumRowDebit += a.debitBalance ?? 0;
    sumRowCredit += a.creditBalance ?? 0;
    const txs = a.transactions ?? [];
    if (txs.length > 0) accountsWithLines++;
    for (const t of txs) {
      sumLineDebit += t.debitAmount ?? 0;
      sumLineCredit += t.creditAmount ?? 0;
    }
  }

  const checks: { name: string; ok: boolean; detail: string }[] = [];

  checks.push({
    name: 'Gross: totalDebits === totalCredits',
    ok: near(totals.totalDebits, totals.totalCredits),
    detail: `Dr ${totals.totalDebits.toFixed(4)} vs Cr ${totals.totalCredits.toFixed(4)}`,
  });

  checks.push({
    name: 'Net columns: netDebitColumnTotal === netCreditColumnTotal',
    ok: near(totals.netDebitColumnTotal, totals.netCreditColumnTotal),
    detail: `netDr ${totals.netDebitColumnTotal.toFixed(4)} vs netCr ${totals.netCreditColumnTotal.toFixed(4)}`,
  });

  checks.push({
    name: 'Rows: SUM(debitBalance) === totals.netDebitColumnTotal',
    ok: near(sumRowDebit, totals.netDebitColumnTotal),
    detail: `summed ${sumRowDebit.toFixed(4)} vs reported ${totals.netDebitColumnTotal.toFixed(4)}`,
  });

  checks.push({
    name: 'Rows: SUM(creditBalance) === totals.netCreditColumnTotal',
    ok: near(sumRowCredit, totals.netCreditColumnTotal),
    detail: `summed ${sumRowCredit.toFixed(4)} vs reported ${totals.netCreditColumnTotal.toFixed(4)}`,
  });

  checks.push({
    name: 'Lines: SUM(line debits) === totals.totalDebits',
    ok: near(sumLineDebit, totals.totalDebits),
    detail: `summed ${sumLineDebit.toFixed(4)} vs reported ${totals.totalDebits.toFixed(4)}`,
  });

  checks.push({
    name: 'Lines: SUM(line credits) === totals.totalCredits',
    ok: near(sumLineCredit, totals.totalCredits),
    detail: `summed ${sumLineCredit.toFixed(4)} vs reported ${totals.totalCredits.toFixed(4)}`,
  });

  console.log('Reported totals:');
  console.log('  totalDebits (gross):', totals.totalDebits);
  console.log('  totalCredits (gross):', totals.totalCredits);
  console.log('  netDebitColumnTotal:', totals.netDebitColumnTotal);
  console.log('  netCreditColumnTotal:', totals.netCreditColumnTotal);
  console.log('  isBalanced:', totals.isBalanced);
  console.log('');
  console.log('Derived from response accounts[]:');
  console.log('  account rows:', tb.accounts.length, '| with transactions:', accountsWithLines);
  console.log('  SUM(debitBalance):', sumRowDebit);
  console.log('  SUM(creditBalance):', sumRowCredit);
  console.log('  SUM(transaction debits):', sumLineDebit);
  console.log('  SUM(transaction credits):', sumLineCredit);
  console.log('');
  console.log('Checks:');
  let allOk = true;
  for (const c of checks) {
    const mark = c.ok ? 'PASS' : 'FAIL';
    if (!c.ok) allOk = false;
    console.log(`  [${mark}] ${c.name}`);
    console.log(`         ${c.detail}`);
  }
  console.log('');
  console.log(allOk ? 'ALL CHECKS PASSED' : 'ONE OR MORE CHECKS FAILED');
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
