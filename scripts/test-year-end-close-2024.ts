// @ts-nocheck
/**
 * Retained Earnings Logic – Year-End Close 2024
 *
 * Requirement: Run the "Year-End Close" for 2024.
 * Expected: All accounts in range 4000-5999 show 0.00 balance for the new year.
 *           Net difference is added to GL 3100 (Retained Earnings).
 *
 * Run: npx ts-node scripts/test-year-end-close-2024.ts
 * (Test data is left in place; no cleanup.)
 */
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../src/utils/database';
import { runYearEndClose, getAccountBalanceAsOf } from '../src/services/YearEndCloseService';

const YEAR = 2024;
const END_OF_YEAR = new Date(YEAR, 11, 31, 23, 59, 59, 999);
const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

/** Ensure there is some 2024 P&L activity so the close has a net to transfer to 3100. */
async function ensure2024PnlActivity(adminId: string, currencyId: string) {
  const mid2024 = new Date(YEAR, 5, 15, 12, 0, 0, 0);
  const acc4000 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '4000', isActive: true } });
  const acc5200 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '5200', isActive: true } })
    ?? await prisma.chartOfAccounts.findFirst({ where: { accountNo: { gte: '5000', lte: '5999' }, isActive: true } });
  const bankGl = await prisma.chartOfAccounts.findFirst({ where: { accountNo: { in: ['1000', '1010', '1100'] }, isActive: true } });
  if (!acc4000 || !bankGl) return;
  const existing = await prisma.journalEntry.findFirst({
    where: { description: { contains: 'Year-End Close' }, transactionDate: { gte: new Date(YEAR, 0, 1), lte: END_OF_YEAR } }
  });
  if (existing) return;
  const ref = `TEST-YEC-2024-${Date.now()}`;
  const je = await prisma.journalEntry.create({
    data: {
      transactionDate: mid2024,
      referenceNumber: ref,
      description: 'Test revenue 2024 for year-end close',
      totalAmount: new Decimal(5000),
      currencyId,
      status: 'POSTED',
      createdById: adminId
    }
  });
  await prisma.journalEntryLine.create({
    data: {
      journalEntryId: je.id,
      chartOfAccountId: bankGl.id,
      debitAmount: new Decimal(5000),
      creditAmount: new Decimal(0),
      description: 'Dr Bank'
    }
  });
  await prisma.journalEntryLine.create({
    data: {
      journalEntryId: je.id,
      chartOfAccountId: acc4000.id,
      debitAmount: new Decimal(0),
      creditAmount: new Decimal(5000),
      description: 'Cr Revenue'
    }
  });
  if (acc5200) {
    const ref2 = `TEST-YEC-2024-EXP-${Date.now()}`;
    const je2 = await prisma.journalEntry.create({
      data: {
        transactionDate: mid2024,
        referenceNumber: ref2,
        description: 'Test expense 2024 for year-end close',
        totalAmount: new Decimal(1200),
        currencyId,
        status: 'POSTED',
        createdById: adminId
      }
    });
    await prisma.journalEntryLine.create({
      data: { journalEntryId: je2.id, chartOfAccountId: acc5200.id, debitAmount: new Decimal(1200), creditAmount: new Decimal(0), description: 'Dr Expense' }
    });
    await prisma.journalEntryLine.create({
      data: { journalEntryId: je2.id, chartOfAccountId: bankGl.id, debitAmount: new Decimal(0), creditAmount: new Decimal(1200), description: 'Cr Bank' }
    });
  }
  console.log('  Created test P&L activity in 2024 (revenue 5000, expense 1200 if available).\n');
}

async function main() {
  console.log('========== Year-End Close 2024 (Retained Earnings Logic) ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } }
  });
  if (!admin) throw new Error('Admin user not found');

  const currency = await prisma.currency.findFirst({ where: { isActive: true } });
  if (currency) await ensure2024PnlActivity(admin.id, currency.id);

  const pnlAccounts = await prisma.chartOfAccounts.findMany({
    where: {
      accountNo: { gte: '4000', lte: '5999' },
      isActive: true
    },
    orderBy: { accountNo: 'asc' }
  });
  const retainedEarnings = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '3100', isActive: true }
  });
  assert(!!retainedEarnings, 'GL 3100 (Retained Earnings) must exist');

  console.log('P&L accounts (4000-5999):', pnlAccounts.length);
  console.log('Retained Earnings (3100):', retainedEarnings?.accountNo, retainedEarnings?.accountName);
  console.log('');

  const balance3100Before = retainedEarnings
    ? await getAccountBalanceAsOf(retainedEarnings.id, 'Equity', END_OF_YEAR)
    : 0;
  console.log('3100 balance before close (as of end 2024):', balance3100Before);
  console.log('');

  console.log('--- Running Year-End Close for', YEAR, '---\n');
  const result = await runYearEndClose({
    year: YEAR,
    createdById: admin.id
  });

  assert(result.success, result.message ?? 'Year-End Close must succeed');
  if (!result.success) {
    console.log('FAIL:', result.message);
    failures.forEach((f) => console.log('  -', f));
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('Result:', result.message);
  if (result.referenceNumber) console.log('Reference:', result.referenceNumber);
  if (result.totalClosedToRetainedEarnings != null) {
    console.log('Net transferred to 3100:', result.totalClosedToRetainedEarnings);
  }
  if (result.accountsZeroed != null) console.log('Accounts zeroed:', result.accountsZeroed);
  console.log('');

  console.log('--- Verify: all 4000-5999 show 0.00 after close ---\n');
  for (const acc of pnlAccounts) {
    const balance = await getAccountBalanceAsOf(acc.id, acc.accountType, END_OF_YEAR);
    assert(Math.abs(balance) < 0.02, `Account ${acc.accountNo} (${acc.accountName}) should be 0.00 after close; got ${balance.toFixed(2)}`);
    if (Math.abs(balance) >= 0.02) {
      console.log('  FAIL:', acc.accountNo, acc.accountName, 'balance', balance);
    }
  }

  const balance3100After = retainedEarnings
    ? await getAccountBalanceAsOf(retainedEarnings.id, 'Equity', END_OF_YEAR)
    : 0;
  console.log('3100 balance after close (as of end 2024):', balance3100After);

  const expectedIncrease = result.totalClosedToRetainedEarnings ?? 0;
  const actualIncrease = balance3100After - balance3100Before;
  assert(
    Math.abs(actualIncrease - expectedIncrease) < 0.02,
    `3100 should increase by ${expectedIncrease.toFixed(2)}; actual increase ${actualIncrease.toFixed(2)}`
  );

  console.log('');
  console.log('========== Summary ==========');
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('Year-End Close 2024 test PASSED:');
  console.log('  - All accounts 4000-5999 show 0.00 balance after close.');
  console.log('  - Net difference added to GL 3100 (Retained Earnings).');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
