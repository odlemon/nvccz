// @ts-nocheck
/**
 * Bank and Cash – Expense Payments
 *
 * Record a 300 ZIG payment for "Electricity" (GL 5200).
 * - Bank (bank's GL, e.g. 1100) is Credited
 * - Electricity Expense (5200) is Debited
 * - Bank register shows "Money Out" (PAYMENT)
 *
 * Uses actual accounts in DB (5200 or Electricity/Utilities expense). No cleanup.
 * Run: npx ts-node scripts/test-expense-payments.ts
 */
import { prisma } from '../src/utils/database';
import { CashbookService } from '../src/services/CashbookService';

const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log('========== Expense Payments: 300 ZIG – Electricity (GL 5200) ==========\n');

  // --- 1. Discover accounts ---
  console.log('--- 1. Discover accounts in DB ---\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } }
  });
  if (!admin) throw new Error('Admin user not found');

  const currencies = await prisma.currency.findMany({
    where: { isActive: true },
    orderBy: { code: 'asc' }
  });
  console.log('Currencies:', currencies.length);
  currencies.forEach((c) => console.log('  ', c.code, '-', c.name));
  const currency = currencies.find((c) => c.code === 'ZIG') ?? currencies.find((c) => c.code === 'ZWL') ?? currencies[0];
  console.log('  -> Using:', currency.code, '\n');

  const banks = await prisma.bank.findMany({
    where: { isActive: true },
    include: { glAccount: true }
  });
  console.log('Banks (with GL):', banks.length);
  banks.forEach((b) => console.log('  ', b.name, '| GL:', b.glAccount?.accountNo ?? 'N/A', b.glAccount?.accountName ?? ''));
  const bankWith1100 = banks.find((b) => b.glAccount?.accountNo === '1100');
  const bank = bankWith1100 ?? banks.find((b) => b.glAccountId && b.glAccount) ?? null;
  if (!bank || !bank.glAccountId) throw new Error('No bank with GL account found');
  const bankGLNo = bank.glAccount!.accountNo;
  const bankGLName = bank.glAccount!.accountName;
  console.log('  -> Using bank:', bank.name, '| GL', bankGLNo, bankGLName, '\n');

  const expenseAccounts = await prisma.chartOfAccounts.findMany({
    where: { accountType: 'Expense', isActive: true },
    orderBy: { accountNo: 'asc' }
  });
  console.log('Expense accounts:', expenseAccounts.length);
  expenseAccounts.forEach((a) => console.log('  ', a.accountNo, '-', a.accountName));
  const electricityAccount =
    expenseAccounts.find((a) => a.accountNo === '5200') ??
    expenseAccounts.find((a) => (a.accountName || '').toLowerCase().includes('electricity')) ??
    expenseAccounts.find((a) => (a.accountName || '').toLowerCase().includes('utilities')) ??
    expenseAccounts.find((a) => a.accountNo.startsWith('5')) ??
    expenseAccounts[0];
  if (!electricityAccount) throw new Error('No Expense account found (need 5200 or Electricity/Utilities)');
  console.log('  -> Using (Electricity):', electricityAccount.accountNo, electricityAccount.accountName, '\n');

  // --- 2. Record expense payment ---
  console.log('--- 2. Record 300 payment for "Electricity" ---\n');

  const amount = 300;
  const result = await CashbookService.createCashPayment({
    bankId: bank.id,
    transactionDate: new Date(),
    description: 'Electricity',
    amount,
    counterpartyType: 'GL',
    glAccountId: electricityAccount.id,
    vatCode: '0%',
    createdById: admin.id
  });

  assert(result.success, result.message ?? 'Payment must succeed');
  assert(!!result.transaction, 'Cashbook transaction must be created');
  assert(!!result.journalEntry, 'Journal entry must be created (GL payment is auto-posted)');

  if (!result.journalEntry) {
    console.log('FAIL:', failures);
    await prisma.$disconnect();
    process.exit(1);
  }

  // --- 3. JE checks: Electricity Debited, Bank Credited ---
  console.log('--- 3. Journal entry checks ---\n');

  const jeId = result.journalEntry.id;
  const lines = await prisma.journalEntryLine.findMany({
    where: { journalEntryId: jeId },
    include: { chartOfAccount: true }
  });

  const totalDebits = lines.reduce((s, l) => s + Number(l.debitAmount), 0);
  const totalCredits = lines.reduce((s, l) => s + Number(l.creditAmount), 0);
  assert(Math.abs(totalDebits - totalCredits) < 0.01, `JE must balance: debits=${totalDebits}, credits=${totalCredits}`);

  const expenseLine = lines.find((l) => l.chartOfAccountId === electricityAccount.id);
  const bankLine = lines.find((l) => l.chartOfAccountId === bank.glAccountId);

  assert(!!expenseLine, 'JE must have a line for Electricity (' + electricityAccount.accountNo + ')');
  assert(!!bankLine, 'JE must have a line for Bank (' + bankGLNo + ')');
  assert(Number(expenseLine?.debitAmount ?? 0) === amount, `Electricity must be Debited ${amount}; got ${expenseLine?.debitAmount}`);
  assert(Number(bankLine?.creditAmount ?? 0) === amount, `Bank must be Credited ${amount}; got ${bankLine?.creditAmount}`);
  assert(Number(expenseLine?.creditAmount ?? 0) === 0, 'Expense line must have no credit');
  assert(Number(bankLine?.debitAmount ?? 0) === 0, 'Bank line must have no debit');

  console.log('JE lines:');
  lines.forEach((l) => {
    console.log('  ', l.chartOfAccount.accountNo, l.chartOfAccount.accountName, '| Dr:', l.debitAmount, 'Cr:', l.creditAmount);
  });
  console.log('  Total Dr:', totalDebits, '| Total Cr:', totalCredits, '| Balanced:', Math.abs(totalDebits - totalCredits) < 0.01);
  console.log('');

  // --- 4. Bank register: PAYMENT = Money Out ---
  console.log('--- 4. Bank register (Money Out) ---\n');

  const entry = await prisma.cashbookEntry.findUnique({
    where: { id: result.transaction.id }
  });
  assert(entry?.type === 'PAYMENT', 'Bank register: type must be PAYMENT (Money Out)');
  assert(Number(entry?.amount ?? 0) === amount, `Bank register: amount must be ${amount}; got ${entry?.amount}`);

  console.log('Cashbook entry:', entry?.id);
  console.log('  Type:', entry?.type, '(Money Out)');
  console.log('  Amount:', entry?.amount);
  console.log('  Description:', entry?.description);
  console.log('  Bank:', bank.name);
  console.log('');

  // --- 5. Summary (no cleanup) ---
  console.log('========== Summary ==========');
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('Expense payments test passed:');
  console.log('  - Used accounts: Bank', bankGLNo, ', Expense', electricityAccount.accountNo, electricityAccount.accountName);
  console.log('  - 300', currency.code, 'for "Electricity": Expense Debited, Bank Credited');
  console.log('  - Bank register shows PAYMENT (Money Out).');
  console.log('  - Data left in place (no cleanup).');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
