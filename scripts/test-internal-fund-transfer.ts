// @ts-nocheck
/**
 * Internal Fund Transfers (ZiG)
 *
 * Ensures a second ZiG bank (Petty Cash on GL 1150 when available), then transfers 5000 ZIG
 * from the primary ZiG operating bank (GL 1100) to Petty Cash.
 * Source bank GL is Credited; destination bank GL is Debited. No P&L lines.
 *
 * Run: npx ts-node scripts/test-internal-fund-transfer.ts
 */
import { prisma } from '../src/utils/database';
import { CashbookService } from '../src/services/CashbookService';
import { CashbookTransferService } from '../src/services/CashbookTransferService';
import { Decimal } from '@prisma/client/runtime/library';

const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

/**
 * GL for petty (prefer 1150); if taken by a non–ZiG bank, use 1151, 1152, …
 */
async function ensurePettyZigBank(zigCurrencyId: string) {
  const tryAccountNos = ['1150', '1151', '1152', '1153'];

  for (const accountNo of tryAccountNos) {
    let coa = await prisma.chartOfAccounts.findFirst({
      where: { accountNo, isActive: true }
    });

    if (!coa) {
      coa = await prisma.chartOfAccounts.create({
        data: {
          accountNo,
          accountName: accountNo === '1150' ? 'Petty Cash - ZiG' : `Petty Cash ZiG (${accountNo})`,
          accountType: 'Current Asset',
          financialStatement: 'Balance Sheet',
          naturalBalance: 'DEBIT',
          isActive: true
        }
      });
      console.log(`Created chart account ${accountNo} (${coa.accountName})`);
    }

    const bankOnGl = await prisma.bank.findFirst({
      where: { glAccountId: coa.id, isActive: true },
      include: { glAccount: true }
    });

    if (!bankOnGl) {
      const bank = await prisma.bank.create({
        data: {
          name: 'Petty Cash - ZiG',
          accountNumber: `ZIG-PETTY-${Date.now()}`,
          currencyId: zigCurrencyId,
          glAccountId: coa.id,
          isActive: true
        },
        include: { glAccount: true }
      });
      console.log(`Created second ZiG bank "${bank.name}" → GL ${coa.accountNo}\n`);
      return bank;
    }

    if (bankOnGl.currencyId === zigCurrencyId) {
      console.log(`Using existing ZiG bank on GL ${coa.accountNo}: "${bankOnGl.name}"\n`);
      return bankOnGl;
    }

    console.log(`GL ${accountNo} in use by non-ZiG bank, trying next slot…`);
  }

  throw new Error('No free petty-style GL slot (1150–1153) for a ZiG bank');
}

async function main() {
  console.log('========== Internal Fund Transfer: 5000 ZIG (Operating → Petty) ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } }
  });
  if (!admin) throw new Error('Admin user not found');

  const { bank: fromBank } = await CashbookService.ensureZigCashbookBank();
  if (!fromBank.glAccountId || !fromBank.glAccount) {
    throw new Error('Primary ZiG bank must have a GL account');
  }

  const zigCurrencyId = fromBank.currencyId;
  const toBank = await ensurePettyZigBank(zigCurrencyId);

  if (fromBank.id === toBank.id) {
    throw new Error('from and to bank are the same; cannot run transfer test');
  }

  const sourceGLNo = fromBank.glAccount.accountNo;
  const destGLNo = toBank.glAccount.accountNo;
  console.log('From:', fromBank.name, '| GL', sourceGLNo);
  console.log('To:', toBank.name, '| GL', destGLNo);
  console.log('');

  const amount = 5000;
  const transferDate = new Date();
  const result = await CashbookTransferService.createTransfer(
    {
      fromBankId: fromBank.id,
      toBankId: toBank.id,
      amount: new Decimal(amount),
      transferDate,
      description: 'Internal transfer Operating to Petty Cash (UAT)'
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

  const fromEntry = await prisma.cashbookEntry.findUnique({
    where: { id: result.data.fromTransactionId },
    include: {
      journalEntry: {
        include: {
          journalEntryLines: { include: { chartOfAccount: true } }
        }
      }
    }
  });

  assert(!!fromEntry?.journalEntryId, 'OUT cashbook line must link to the transfer journal');
  const je = fromEntry.journalEntry;
  assert(!!je && je.journalEntryLines.length === 2, 'Transfer must produce exactly one JE with two lines');

  let totalSourceCredit = 0;
  let totalDestDebit = 0;
  const revenueExpenseAccountTypes = ['Revenue', 'Income', 'Expense'];
  let anyRevenueExpense = false;

  for (const line of je.journalEntryLines) {
    const dr = Number(line.debitAmount);
    const cr = Number(line.creditAmount);
    if (line.chartOfAccountId === fromBank.glAccountId) {
      totalSourceCredit += cr;
    }
    if (line.chartOfAccountId === toBank.glAccountId) {
      totalDestDebit += dr;
    }
    if (revenueExpenseAccountTypes.includes(line.chartOfAccount?.accountType ?? '')) {
      anyRevenueExpense = true;
    }
  }

  console.log('--- Journal (single balanced entry) ---');
  console.log('  JE ref:', je.referenceNumber);
  console.log('  Source (', sourceGLNo, ') total Credit:', totalSourceCredit);
  console.log('  Dest (', destGLNo, ') total Debit:', totalDestDebit);
  console.log('  Any Revenue/Expense lines:', anyRevenueExpense);
  console.log('');

  assert(totalSourceCredit === amount, `Source GL (${sourceGLNo}) must be Credited ${amount}; got ${totalSourceCredit}`);
  assert(totalDestDebit === amount, `Dest GL (${destGLNo}) must be Debited ${amount}; got ${totalDestDebit}`);
  assert(!anyRevenueExpense, 'No Revenue or Expense lines on transfer JE');

  console.log('========== Summary ==========');
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('Internal fund transfer UAT passed:');
  console.log(`  - ${amount} ZIG from "${fromBank.name}" to "${toBank.name}".`);
  console.log('  - Source GL', sourceGLNo, 'Credited; destination GL', destGLNo, 'Debited.');
  console.log('  - No Revenue or Expense impact.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
