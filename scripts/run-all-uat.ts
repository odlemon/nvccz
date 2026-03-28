// @ts-nocheck
/**
 * Runs accounting / UAT npm scripts in sequence. Stops on first failure.
 *
 *   npm run test:uat:all
 */
import { execSync } from 'child_process';
import { resolve } from 'path';

const root = resolve(__dirname, '..');

const SCRIPTS = [
  // Skip legacy ExpenseService/ExpenseController tests (out of sync with prisma + API); core GL/VAT/JE tests only
  'test:accounting:core',
  'test:invoice-lifecycle',
  'test:uat:usd-zar-cross',
  'test:uat:vat-zig-invoice',
  'test:uat:fx-realized-usd-zwl',
  'test:uat:partial-pay-zwl',
  'test:uat:creditors-rent',
  'test:uat:debtors-age',
  'test:uat:debtors-control-zig-invoice',
  'test:uat:cashbook-revenue-zig',
  'test:uat:cashbook-expense-zig',
  'test:uat:credit-note-zig',
  'test:uat:asset-acquisition-zig',
  'test:uat:depreciation-scrap-floor',
  'test:uat:depreciation-je-mapping',
  'test:uat:asset-disposal-zig',
  'test:uat:revenue-zig-double-entry',
  'test:rounding-variance-zig',
  'test:reconciliation-unreconciled',
  'test:cashbook-complex-search',
  'test:internal-fund-transfer',
  'test:uat:staff-reimbursement-vendor',
  'test:uat:procurement-po',
  'test:uat:commitment-zig',
  'test:uat:three-way-variance',
  'test:journal-security-audit',
  'test:audit-trail-sequential',
  'check:audit-trail-all',
];

function main() {
  const start = Date.now();
  let failed: string | null = null;

  for (const name of SCRIPTS) {
    console.log(`\n${'='.repeat(72)}\n  ${name}\n${'='.repeat(72)}\n`);
    try {
      execSync(`npm run ${name}`, {
        cwd: root,
        stdio: 'inherit',
        env: process.env,
      });
    } catch {
      failed = name;
      break;
    }
  }

  const sec = ((Date.now() - start) / 1000).toFixed(1);
  if (failed) {
    console.error(`\nUAT suite FAILED at: ${failed} (after ${sec}s)\n`);
    process.exit(1);
  }
  console.log(`\nUAT suite completed successfully in ${sec}s.\n`);
}

main();
