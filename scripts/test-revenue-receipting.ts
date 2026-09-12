// @ts-nocheck
/**
 * Revenue Receipting
 *
 * Requirement: Record a 1200 ZIG payment from a customer for "Consulting Services".
 * Expected: Bank (1100) is Debited; Income (4000) is Credited. Bank register shows "Money In".
 * Note: ZIG and ZWL are the same currency (Zimbabwe); either code is accepted.
 *
 * 1. Resolve Bank GL 1100, Income 4000, currency (ZIG or ZWL).
 * 2. Record 1200 receipt for "Consulting Services": Dr Bank, Cr Income.
 * 3. Assert JE: Bank (1100) debited 1200, Income (4000) credited 1200; bank register RECEIPT (Money In).
 *
 * Run: npx ts-node scripts/test-revenue-receipting.ts
 */
import { prisma } from '../src/utils/database';
import { CashbookService } from '../src/services/CashbookService';

const failures: string[] = [];
const BANK_GL_REQUIRED = '1100';
const INCOME_ACCOUNT_REQUIRED = '4000';
const AMOUNT_ZIG = 1200;
const DESCRIPTION = 'Consulting Services';

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

/** Ensure GL 1100 is Bank and a bank record exists (for test requirement). */
async function ensureBank1100Exists(currencyId: string) {
  let gl1100 = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: BANK_GL_REQUIRED, isActive: true }
  });
  if (!gl1100) {
    gl1100 = await prisma.chartOfAccounts.create({
      data: {
        accountNo: BANK_GL_REQUIRED,
        accountName: 'Bank',
        accountType: 'Current Asset',
        financialStatement: 'Balance Sheet',
        notes: 'Bank for revenue receipting'
      }
    });
  } else if (gl1100.accountName !== 'Bank' || gl1100.accountType !== 'Current Asset') {
    await prisma.chartOfAccounts.update({
      where: { id: gl1100.id },
      data: { accountName: 'Bank', accountType: 'Current Asset' }
    });
  }
  let bank = await prisma.bank.findFirst({
    where: { glAccountId: gl1100.id, isActive: true },
    include: { glAccount: true }
  });
  if (!bank) {
    bank = await prisma.bank.create({
      data: {
        name: 'Bank (1100)',
        accountNumber: 'BANK-1100',
        currencyId,
        glAccountId: gl1100.id,
        isActive: true
      },
      include: { glAccount: true }
    });
  }
  return bank;
}

async function main() {
  console.log('========== Revenue Receipting: 1200 ZIG, Consulting Services ==========\n');

  // --- 1. Resolve Bank (1100), Income (4000), ZIG ---
  console.log('--- 1. Resolve accounts (Bank 1100, Income 4000, ZIG) ---\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } }
  });
  if (!admin) throw new Error('Admin user not found');

  // ZIG and ZWL are the same currency (Zimbabwe)
  const currency = await prisma.currency.findFirst({
    where: { OR: [{ code: 'ZIG' }, { code: 'ZWL' }], isActive: true }
  }) ?? await prisma.currency.findFirst({ where: { isActive: true } });
  if (!currency) throw new Error('No active currency');
  console.log('Currency:', currency.code, '(ZIG/ZWL same)');

  const gl4000 = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: INCOME_ACCOUNT_REQUIRED, isActive: true }
  });
  if (!gl4000) throw new Error(`Income account ${INCOME_ACCOUNT_REQUIRED} not found`);

  const bank = await ensureBank1100Exists(currency.id);
  const bankGLNo = bank.glAccount!.accountNo;
  const incomeAccount = gl4000;
  console.log('Bank:', bank.name, '| GL', bankGLNo);
  console.log('Income:', incomeAccount.accountNo, incomeAccount.accountName);
  console.log('');

  // --- 2. Record revenue receipt ---
  console.log('--- 2. Record 1200 ZIG for "Consulting Services" ---\n');

  const result = await CashbookService.createCashReceipt({
    bankId: bank.id,
    transactionDate: new Date(),
    description: DESCRIPTION,
    amount: AMOUNT_ZIG,
    counterpartyType: 'GL',
    glAccountId: incomeAccount.id,
    vatCode: '0%',
    createdById: admin.id
  });

  assert(result.success, result.message ?? 'Receipt must succeed');
  assert(!!result.transaction, 'Cashbook transaction must be created');
  assert(!!result.journalEntry, 'Journal entry must be created');

  if (!result.journalEntry) {
    console.log('FAIL:', failures);
    await prisma.$disconnect();
    process.exit(1);
  }

  // --- 3. Rigorous JE checks ---
  console.log('--- 3. Journal entry checks ---\n');

  const jeId = result.journalEntry.id;
  const lines = await prisma.journalEntryLine.findMany({
    where: { journalEntryId: jeId },
    include: { chartOfAccount: true }
  });

  const totalDebits = lines.reduce((s, l) => s + Number(l.debitAmount), 0);
  const totalCredits = lines.reduce((s, l) => s + Number(l.creditAmount), 0);
  assert(lines.length >= 2, `JE must have at least 2 lines; got ${lines.length}`);
  assert(Math.abs(totalDebits - totalCredits) < 0.01, `JE must balance: debits=${totalDebits}, credits=${totalCredits}`);
  assert(Math.abs(totalDebits - AMOUNT_ZIG) < 0.01, `Total debits must be ${AMOUNT_ZIG}; got ${totalDebits}`);

  const bankLine = lines.find((l) => l.chartOfAccountId === bank.glAccountId);
  const incomeLine = lines.find((l) => l.chartOfAccountId === incomeAccount.id);

  assert(!!bankLine, 'JE must have a line for Bank (GL ' + bankGLNo + ')');
  assert(!!incomeLine, 'JE must have a line for Income (' + incomeAccount.accountNo + ')');
  assert(bankGLNo === BANK_GL_REQUIRED, `Bank must be GL ${BANK_GL_REQUIRED}; got ${bankGLNo}`);
  assert(incomeAccount.accountNo === INCOME_ACCOUNT_REQUIRED, `Income must be ${INCOME_ACCOUNT_REQUIRED}; got ${incomeAccount.accountNo}`);
  assert(Number(bankLine?.debitAmount ?? 0) === AMOUNT_ZIG, `Bank must be Debited ${AMOUNT_ZIG}; got ${bankLine?.debitAmount}`);
  assert(Number(incomeLine?.creditAmount ?? 0) === AMOUNT_ZIG, `Income must be Credited ${AMOUNT_ZIG}; got ${incomeLine?.creditAmount}`);
  assert(Number(bankLine?.creditAmount ?? 0) === 0, 'Bank line must have no credit');
  assert(Number(incomeLine?.debitAmount ?? 0) === 0, 'Income line must have no debit');

  console.log('JE lines:');
  lines.forEach((l) => {
    const no = l.chartOfAccount.accountNo;
    const name = l.chartOfAccount.accountName;
    const dr = Number(l.debitAmount);
    const cr = Number(l.creditAmount);
    console.log('  ', no, name, '| Dr:', dr, 'Cr:', cr);
  });
  console.log('  Total Dr:', totalDebits, '| Total Cr:', totalCredits, '| Balanced:', Math.abs(totalDebits - totalCredits) < 0.01);
  console.log('');

  // --- 4. Bank register checks ---
  console.log('--- 4. Bank register (Money In) ---\n');

  const entry = await prisma.cashbookEntry.findUnique({
    where: { id: result.transaction.id }
  });
  assert(entry?.type === 'RECEIPT', 'Bank register: type must be RECEIPT (Money In)');
  assert(Number(entry?.amount ?? 0) === AMOUNT_ZIG, `Bank register: amount must be ${AMOUNT_ZIG}; got ${entry?.amount}`);
  assert((entry?.description ?? '').includes('Consulting'), 'Bank register: description should mention Consulting Services');

  console.log('Cashbook entry:', entry?.id);
  console.log('  Type:', entry?.type, '(Money In)');
  console.log('  Amount:', entry?.amount);
  console.log('  Description:', entry?.description);
  console.log('  Bank:', bank.name);
  console.log('');

  // --- 5. Summary ---
  console.log('========== Summary ==========');
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('Revenue receipting test PASSED:');
  console.log('  - Bank (' + bankGLNo + ') Debited', AMOUNT_ZIG, currency.code + (currency.code === 'ZWL' ? ' (ZIG/ZWL)' : ''));
  console.log('  - Income (' + incomeAccount.accountNo + ') Credited', AMOUNT_ZIG, currency.code);
  console.log('  - Bank register: RECEIPT (Money In) for "' + DESCRIPTION + '".');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
