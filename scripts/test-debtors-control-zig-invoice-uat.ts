/**
 * Control account sync: 500 ZiG invoice → GL 1200 +500 and customer open balance +500.
 * Run: npx ts-node --transpile-only scripts/test-debtors-control-zig-invoice-uat.ts
 */
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../src/utils/database';
import { InvoiceService } from '../src/services/InvoiceService';

const EPS = 0.02;

async function main() {
  console.log('========== Debtors control (1200) vs customer sub-ledger UAT ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } },
  });
  if (!admin) {
    throw new Error('Admin user not found (admin@nts.com or admin@nvccz.co.zw)');
  }

  const zigCurrency =
    (await prisma.currency.findFirst({ where: { code: 'ZIG', isActive: true } })) ||
    (await prisma.currency.findFirst({ where: { code: 'ZWG', isActive: true } })) ||
    (await prisma.currency.findFirst({ where: { code: 'ZWL', isActive: true } })) ||
    (await prisma.currency.findFirst({ where: { isDefault: true, isActive: true } }));
  if (!zigCurrency) {
    throw new Error('No currency found (need ZIG/ZWG/ZWL or a default currency)');
  }
  const code = zigCurrency.code.toUpperCase();
  if (code !== 'ZIG' && code !== 'ZWG') {
    console.log(
      `Note: DB has no ZIG — using ${zigCurrency.code} for the same control-account checks.\n`
    );
  }

  const ar1200 = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1200', isActive: true },
  });
  if (!ar1200) {
    throw new Error('GL 1200 not found — create Debtors Control / Accounts Receivable as account 1200');
  }

  // Fresh customer each run so open-balance aggregate is not polluted by prior UAT invoices
  const customer = await prisma.customer.create({
    data: { name: `UAT Debtors Control ${Date.now()}`, isActive: true },
  });

  const amount = 500;
  const inv = await InvoiceService.createInvoice({
    customerId: customer.id,
    amount,
    totalAmount: amount,
    currencyId: zigCurrency.id,
    transactionDate: new Date(),
    description: 'UAT: Debtors control sync (500 ZiG)',
    isTaxable: false,
    createdById: admin.id,
  });

  await InvoiceService.sendInvoice(inv.id);

  const posted = await prisma.invoice.findUnique({
    where: { id: inv.id },
    include: {
      journalEntry: {
        include: {
          journalEntryLines: { include: { chartOfAccount: true } },
        },
      },
    },
  });

  if (!posted?.journalEntryId || !posted.journalEntry) {
    throw new Error('Invoice missing journal entry after send');
  }
  if (posted.journalEntry.status !== 'POSTED') {
    throw new Error(`Expected journal POSTED after send, got ${posted.journalEntry.status}`);
  }

  const drLine = posted.journalEntry.journalEntryLines.find(
    (l) => l.chartOfAccountId === ar1200.id && new Decimal(l.debitAmount).gt(0)
  );
  if (!drLine) {
    throw new Error('No Dr line on GL 1200 for this invoice');
  }
  const dr = new Decimal(drLine.debitAmount).toNumber();
  if (Math.abs(dr - amount) > EPS) {
    throw new Error(`GL 1200 debit expected ${amount}, got ${dr}`);
  }

  const subLedger = await prisma.invoice.aggregate({
    where: {
      customerId: customer.id,
      currencyId: zigCurrency.id,
      isActive: true,
      status: { in: ['SENT', 'PARTIALLY_PAID'] },
    },
    _sum: { outstandingAmount: true },
  });
  const open = new Decimal(subLedger._sum.outstandingAmount ?? 0).toNumber();
  if (Math.abs(open - amount) > EPS) {
    throw new Error(`Customer open ZiG balance expected ${amount}, got ${open}`);
  }

  console.log('OK: Invoice', posted.invoiceNumber || posted.id);
  console.log('   GL 1200 (', ar1200.accountName, ') Dr:', dr, zigCurrency.code);
  console.log('   Customer', customer.name, 'open receivable (sub-ledger):', open, zigCurrency.code);
  console.log('\nControl account sync check passed.\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
