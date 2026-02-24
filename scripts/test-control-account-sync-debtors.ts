// @ts-nocheck
/**
 * Control Account sync – Debtors (GL 1200 vs Customer sub-ledger)
 *
 * Post a 500 ZIG Invoice to a specific Customer.
 * Assert:
 * - GL Account 1200 (Debtors Control) increases by 500
 * - The Customer's specific sub-ledger balance also increases by 500
 *
 * Run: npx ts-node scripts/test-control-account-sync-debtors.ts
 */
import { prisma } from '../src/utils/database';
import { InvoiceService } from '../src/services/InvoiceService';
import JournalEntryService from '../src/services/JournalEntryService';

const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function getGL1200Balance(): Promise<number> {
  const debtorsAccount = await prisma.chartOfAccounts.findFirst({
    where: {
      accountNo: '1200',
      accountName: { contains: 'Accounts Receivable' },
      accountType: 'Current Asset',
      isActive: true
    }
  });
  if (!debtorsAccount) return NaN;

  const lines = await prisma.journalEntryLine.findMany({
    where: {
      chartOfAccountId: debtorsAccount.id,
      journalEntry: { status: 'POSTED' }
    }
  });
  let balance = 0;
  for (const line of lines) {
    balance += Number(line.debitAmount) - Number(line.creditAmount);
  }
  return balance;
}

async function getCustomerSubLedgerBalance(customerId: string): Promise<number> {
  const invoices = await prisma.invoice.findMany({
    where: {
      customerId,
      status: { in: ['OPEN', 'SENT'] },
      isActive: true
    }
  });
  return invoices.reduce((sum, inv) => sum + Number(inv.outstandingAmount ?? inv.totalAmount ?? 0), 0);
}

async function main() {
  console.log('========== Control Account sync: Debtors (1200) vs Customer sub-ledger ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } }
  });
  if (!admin) throw new Error('Admin user not found');

  // Currency: ZIG preferred, else ZWL, else USD
  let currency = await prisma.currency.findFirst({ where: { code: 'ZIG', isActive: true } });
  if (!currency) {
    currency = await prisma.currency.findFirst({ where: { code: 'ZWL', isActive: true } });
  }
  if (!currency) {
    currency = await prisma.currency.findFirst({ where: { code: 'USD', isActive: true } });
  }
  if (!currency) {
    currency = await prisma.currency.findFirst({ where: { isActive: true } });
  }
  if (!currency) throw new Error('No active currency found');
  console.log(`Currency: ${currency.code} (${currency.name})\n`);

  // Specific customer for test
  let customer = await prisma.customer.findFirst({
    where: { name: { contains: 'Control Account Test' }, isActive: true }
  });
  if (!customer) {
    customer = await prisma.customer.create({
      data: {
        name: 'Control Account Test Customer',
        email: `control-test-${Date.now()}@test.com`,
        isActive: true
      }
    });
    console.log('Created test customer:', customer.name);
  }
  console.log('Customer:', customer.name, `(${customer.id})\n`);

  const debtorsAccount = await prisma.chartOfAccounts.findFirst({
    where: {
      accountNo: '1200',
      accountName: { contains: 'Accounts Receivable' },
      accountType: 'Current Asset',
      isActive: true
    }
  });
  assert(!!debtorsAccount, 'GL 1200 (Debtors Control) must exist');
  if (!debtorsAccount) {
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('GL 1200:', debtorsAccount.accountName, '\n');

  const glBefore = await getGL1200Balance();
  const subBefore = await getCustomerSubLedgerBalance(customer.id);
  console.log('Before invoice:');
  console.log('  GL 1200 (Debtors Control) balance:', glBefore);
  console.log('  Customer sub-ledger balance:     ', subBefore);
  console.log('');

  // Create 500 (ZIG/ZWL/USD) invoice – no VAT so totalAmount = 500
  const invoice = await InvoiceService.createInvoice({
    customerId: customer.id,
    amount: 500,
    currencyId: currency.id,
    transactionDate: new Date(),
    description: 'Control account sync test – 500 ZIG invoice',
    isTaxable: false,
    createdById: admin.id
  });
  assert(!!invoice.journalEntryId, 'Invoice must have journal entry');
  if (!invoice.journalEntryId) {
    await prisma.$disconnect();
    process.exit(1);
  }

  // Post the journal entry so GL is updated
  await JournalEntryService.postJournalEntry(invoice.journalEntryId, admin.id);
  // Send invoice so it appears in open items (SENT = open for collection)
  await InvoiceService.sendInvoice(invoice.id);

  const glAfter = await getGL1200Balance();
  const subAfter = await getCustomerSubLedgerBalance(customer.id);
  console.log('After posting 500 invoice and sending:');
  console.log('  GL 1200 (Debtors Control) balance:', glAfter);
  console.log('  Customer sub-ledger balance:     ', subAfter);
  console.log('');

  const glIncrease = glAfter - glBefore;
  const subIncrease = subAfter - subBefore;

  assert(Math.abs(glIncrease - 500) < 0.01, `GL 1200 should increase by 500; got increase ${glIncrease}`);
  assert(Math.abs(subIncrease - 500) < 0.01, `Customer sub-ledger should increase by 500; got increase ${subIncrease}`);

  console.log('========== Summary ==========');
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('Control account sync test passed:');
  console.log('  - Posted 500', currency.code, 'invoice to customer', customer.name);
  console.log('  - GL 1200 (Debtors Control) increased by 500');
  console.log('  - Customer sub-ledger balance increased by 500');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
