// @ts-nocheck
/**
 * Test: create procurement invoice (direct), pay via ProcurementService, verify cashbook link.
 * Run: npx ts-node scripts/test-procurement-cashbook-payment.ts
 * Credentials: admin@nts.com / admin123
 */
import { prisma } from '../src/utils/database';
import { ProcurementService } from '../src/services/ProcurementService';
import { Decimal } from '@prisma/client/runtime/library';

async function main() {
  console.log('=== Test: Procurement invoice + cashbook payment ===\n');

  const admin = await prisma.user.findUnique({
    where: { email: 'admin@nts.com' }
  });
  if (!admin) throw new Error('User admin@nts.com not found');

  let vendor = await prisma.vendor.findFirst({ where: { isActive: true } });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: { name: 'Test Vendor', email: 'v@test.com', isActive: true }
    });
  }

  const currency = await prisma.currency.findFirst({ where: { code: 'USD' } })
    || await prisma.currency.findFirst({ where: { isActive: true } });
  if (!currency) throw new Error('No currency');

  const invoiceNumber = `PROC-TEST-${Date.now()}`;
  const subtotal = 500;
  const taxAmount = 75;
  const totalAmount = 575;

  const invoice = await prisma.procurementInvoice.create({
    data: {
      invoiceNumber,
      vendorId: vendor.id,
      currencyId: currency.id,
      invoiceDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      subtotal: new Decimal(subtotal),
      taxAmount: new Decimal(taxAmount),
      totalAmount: new Decimal(totalAmount),
      status: 'APPROVED',
      paymentStatus: 'PENDING',
      createdById: admin.id,
      items: {
        create: [{
          itemName: 'Test item',
          quantity: new Decimal(1),
          unitPrice: new Decimal(subtotal),
          totalPrice: new Decimal(subtotal),
          matchStatus: 'PENDING'
        }]
      }
    },
    include: { vendor: true, currency: true, items: true }
  });
  console.log('Created invoice:', invoice.id, invoice.invoiceNumber);

  const bank = await prisma.bank.findFirst({ where: { isActive: true }, include: { glAccount: true } });
  if (!bank) throw new Error('No bank found. Create a bank in cashbook first.');
  console.log('Using bank:', bank.id, bank.name);

  await ProcurementService.payProcurementInvoice(
    invoice.id,
    {
      paymentAmount: totalAmount,
      paymentDate: new Date(),
      paymentMethod: 'BANK',
      bankAccountId: bank.id,
      paymentReference: 'TEST-' + invoiceNumber,
      notes: 'Test payment'
    },
    admin.id
  );

  const updated = await prisma.procurementInvoice.findUnique({
    where: { id: invoice.id },
    include: {
      journalEntry: { select: { id: true, referenceNumber: true, status: true } },
      cashbookEntry: { select: { id: true, reference: true, status: true, amount: true, journalEntryId: true } }
    }
  });

  if (!updated) throw new Error('Invoice not found after payment');
  if (!updated.cashbookEntryId) {
    console.error('\nFAIL: cashbookEntryId is null');
    process.exit(1);
  }
  console.log('\nOK: cashbookEntryId set:', updated.cashbookEntryId);
  console.log('  cashbookEntry:', JSON.stringify(updated.cashbookEntry, null, 2));
  console.log('  paymentStatus:', updated.paymentStatus);
  console.log('\nTest passed.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
