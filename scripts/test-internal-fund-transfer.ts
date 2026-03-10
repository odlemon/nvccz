// @ts-nocheck
/**
 * Internal Fund Transfers
 *
 * Transfer 5000 ZIG from "Savings Account" to "Petty Cash".
 * Source account (Savings, e.g. 1100) is Credited; destination (Petty Cash, e.g. 1150) is Debited.
 * No impact on Revenue or Expenses.
 *
 * Run: npx ts-node scripts/test-internal-fund-transfer.ts
 */
import { prisma } from '../src/utils/database';
import { CashbookTransferService } from '../src/services/CashbookTransferService';
import { Decimal } from '@prisma/client/runtime/library';

const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log('========== Internal Fund Transfer: 5000 from Savings to Petty Cash ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } }
  });
  if (!admin) throw new Error('Admin user not found');

  const savingsBank = await prisma.bank.findFirst({
    where: { name: { contains: 'Savings' }, isActive: true },
    include: { glAccount: true }
  });
  const pettyCashBank = await prisma.bank.findFirst({
    where: { name: { contains: 'Petty Cash' }, isActive: true },
    include: { glAccount: true }
  });

  if (!savingsBank || !savingsBank.glAccountId) throw new Error('Savings Account bank with GL not found');
  if (!pettyCashBank || !pettyCashBank.glAccountId) throw new Error('Petty Cash bank with GL not found');

  const sourceGLNo = savingsBank.glAccount!.accountNo;
  const destGLNo = pettyCashBank.glAccount!.accountNo;
  console.log('From:', savingsBank.name, '| GL', sourceGLNo);
  console.log('To:', pettyCashBank.name, '| GL', destGLNo);
  console.log('');

  const amount = 5000;
  const transferDate = new Date();
  const result = await CashbookTransferService.createTransfer(
    {
      fromBankId: savingsBank.id,
      toBankId: pettyCashBank.id,
      amount: new Decimal(amount),
      transferDate,
      description: 'Internal transfer to Petty Cash'
    },
    admin.id
  );

  assert(result.success, result.message ?? 'Transfer must succeed');
  if (!result.success) {
    console.log('FAIL:', result.message);
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log('Transfer created:', result.data?.transferId);
  console.log('');

  // Find journal entries for this transfer (by date and amount)
  const start = new Date(transferDate.getTime() - 5000);
  const end = new Date(transferDate.getTime() + 5000);
  const journalEntries = await prisma.journalEntry.findMany({
    where: {
      transactionDate: { gte: start, lte: end },
      totalAmount: amount,
      description: { contains: 'Transfer' }
    },
    include: { journalEntryLines: { include: { chartOfAccount: true } } }
  });

  const sourceGLId = savingsBank.glAccountId;
  const destGLId = pettyCashBank.glAccountId;
  let totalSourceCredit = 0;
  let totalDestDebit = 0;
  const revenueExpenseAccountTypes = ['Revenue', 'Income', 'Expense'];
  let anyRevenueExpense = false;

  for (const je of journalEntries) {
    for (const line of je.journalEntryLines) {
      const dr = Number(line.debitAmount);
      const cr = Number(line.creditAmount);
      if (line.chartOfAccountId === sourceGLId) {
        totalSourceCredit += cr;
      }
      if (line.chartOfAccountId === destGLId) {
        totalDestDebit += dr;
      }
      if (revenueExpenseAccountTypes.includes(line.chartOfAccount?.accountType ?? '')) {
        anyRevenueExpense = true;
      }
    }
  }

  console.log('--- Journal effect ---');
  console.log('  Source (', sourceGLNo, ') total Credit:', totalSourceCredit);
  console.log('  Dest (', destGLNo, ') total Debit:', totalDestDebit);
  console.log('  Any Revenue/Expense lines:', anyRevenueExpense);
  console.log('');

  assert(totalSourceCredit === amount, `Source account (${sourceGLNo}) must be Credited ${amount}; got ${totalSourceCredit}`);
  assert(totalDestDebit === amount, `Destination account (${destGLNo}) must be Debited ${amount}; got ${totalDestDebit}`);
  assert(!anyRevenueExpense, 'No impact on Revenue or Expenses (no Revenue/Expense lines in transfer JEs)');

  console.log('========== Summary ==========');
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('Internal fund transfer test passed:');
  console.log('  - 5000 transferred from Savings Account to Petty Cash.');
  console.log('  - Account', sourceGLNo, 'Credited; Account', destGLNo, 'Debited.');
  console.log('  - No Revenue or Expense impact.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
