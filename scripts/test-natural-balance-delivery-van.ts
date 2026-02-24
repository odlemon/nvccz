// @ts-nocheck
/**
 * Natural Balance defaults – Delivery Van (GL 1520)
 *
 * Creates a new Asset account "Delivery Van" (GL 1520).
 * Natural Balance for Asset accounts is Debit: any entry increasing this account
 * must be a Debit in the ledger. This test verifies that:
 * 1. Account 1520 "Delivery Van" exists (Fixed Asset)
 * 2. An increase to the account is recorded as a Debit (purchase of van: Dr 1520, Cr Bank)
 * 3. The ledger view shows the increase as Debit
 *
 * Run: npx ts-node scripts/test-natural-balance-delivery-van.ts
 */
import { prisma } from '../src/utils/database';
import JournalEntryService from '../src/services/JournalEntryService';

const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log('========== Natural Balance: Delivery Van (GL 1520) ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } }
  });
  if (!admin) {
    throw new Error('Admin user not found (admin@nts.com or admin@nvccz.co.zw)');
  }

  const currency = await prisma.currency.findFirst({ where: { code: 'USD' } }) || await prisma.currency.findFirst({ where: { isActive: true } });
  if (!currency) throw new Error('No currency found');

  // --- 1. Ensure account 1520 "Delivery Van" exists (Fixed Asset, Natural Balance = Debit) ---
  console.log('1. Chart of Accounts: Delivery Van (1520)');
  let deliveryVanAccount = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1520' }
  });

  if (!deliveryVanAccount) {
    deliveryVanAccount = await prisma.chartOfAccounts.create({
      data: {
        accountNo: '1520',
        accountName: 'Delivery Van',
        accountType: 'Fixed Asset',
        financialStatement: 'Balance Sheet',
        notes: 'Delivery van asset. Natural balance: Debit. Increases must be Debit.',
        isActive: true
      }
    });
    console.log('   Created account 1520 Delivery Van (Fixed Asset)\n');
  } else {
    console.log('   Found account 1520:', deliveryVanAccount.accountName, `(${deliveryVanAccount.accountType})`);
    if (deliveryVanAccount.accountName !== 'Delivery Van') {
      await prisma.chartOfAccounts.update({
        where: { id: deliveryVanAccount.id },
        data: { accountName: 'Delivery Van', accountType: 'Fixed Asset' }
      });
      console.log('   Updated to Delivery Van, Fixed Asset');
    }
    console.log('');
  }

  assert(deliveryVanAccount.accountType === 'Fixed Asset' || deliveryVanAccount.accountType === 'Current Asset', 'Account 1520 must be an Asset type (Natural Balance = Debit)');

  // --- 2. Get Bank account for the credit side ---
  const bankAccount = await prisma.chartOfAccounts.findFirst({
    where: {
      OR: [
        { accountNo: '1000' },
        { accountName: { contains: 'Cash and Cash Equivalents' } }
      ],
      isActive: true
    }
  });
  if (!bankAccount) {
    throw new Error('Bank account (1000) not found');
  }

  // --- 3. Create journal entry: increase Delivery Van (Debit 1520, Credit Bank) ---
  console.log('2. Journal entry: Purchase of Delivery Van (increase asset = Debit)');
  const amount = 10000;
  const result = await JournalEntryService.createManualJournalEntry({
    transactionDate: new Date(),
    referenceNumber: `NB-1520-${Date.now()}`,
    description: 'Purchase of Delivery Van – increase in asset (Natural Balance: Debit)',
    currencyId: currency.id,
    journalEntryLines: [
      {
        chartOfAccountId: deliveryVanAccount.id,
        debitAmount: amount,
        creditAmount: 0,
        description: 'Delivery Van – asset increase (Debit)'
      },
      {
        chartOfAccountId: bankAccount.id,
        debitAmount: 0,
        creditAmount: amount,
        description: 'Bank – payment for delivery van'
      }
    ],
    createdById: admin.id
  });

  if ((result as any).success === false) {
    assert(false, `Journal entry creation failed: ${(result as any).error || 'Unknown error'}`);
  }
  assert(result.journalEntry != null, 'Journal entry must be created');
  assert(Array.isArray(result.journalEntryLines) && result.journalEntryLines.length >= 2, 'Journal entry must have at least 2 lines');

  const line1520 = result.journalEntryLines!.find((l: any) => l.chartOfAccountId === deliveryVanAccount.id);
  assert(!!line1520, 'Journal entry must have a line for account 1520');
  const debit1520 = Number(line1520?.debitAmount ?? 0);
  const credit1520 = Number(line1520?.creditAmount ?? 0);

  assert(debit1520 > 0, `Account 1520 (Delivery Van) increase must be recorded as Debit; got debit=${debit1520}, credit=${credit1520}`);
  assert(credit1520 === 0, `Account 1520 (Asset) increase must not be Credit; got credit=${credit1520}`);

  console.log('   JE created:', result.journalEntry?.referenceNumber);
  console.log('   Line 1520 Delivery Van: Debit', debit1520, 'Credit', credit1520);
  console.log('   Natural Balance (Debit) satisfied: increase = Debit\n');

  // --- 4. Ledger view: verify the entry shows Debit for 1520 ---
  console.log('3. Ledger view check');
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      journalEntryId: result.journalEntry!.id,
      chartOfAccountId: deliveryVanAccount.id
    },
    include: { chartOfAccount: true }
  });
  const ledgerLine = lines[0];
  assert(ledgerLine && Number(ledgerLine.debitAmount) > 0 && Number(ledgerLine.creditAmount) === 0,
    'In ledger view, account 1520 must show Debit for increase, Credit = 0');
  console.log('   Ledger: 1520 Delivery Van – Debit', ledgerLine?.debitAmount, 'Credit', ledgerLine?.creditAmount);
  console.log('   OK.\n');

  // --- Summary ---
  console.log('========== Summary ==========');
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    process.exit(1);
  }
  console.log('Natural Balance test passed:');
  console.log('  - Account 1520 Delivery Van (Fixed Asset) exists');
  console.log('  - Natural Balance = Debit (asset increase recorded as Debit)');
  console.log('  - Ledger view shows increase as Debit.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
