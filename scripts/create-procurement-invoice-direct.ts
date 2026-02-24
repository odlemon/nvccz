// @ts-nocheck
/**
 * Create a procurement invoice directly (no requisition/PO/quotation flow).
 * For testing cashbook payment integration.
 * Run: npx ts-node scripts/create-procurement-invoice-direct.ts
 *
 * Uses: admin@nts.com for createdById. Creates one vendor if none, one currency (USD), one APPROVED invoice with one item.
 */
import { prisma } from '../src/utils/database';
import { Decimal } from '@prisma/client/runtime/library';

async function main() {
  console.log('Creating procurement invoice (direct, for testing)...\n');

  const admin = await prisma.user.findUnique({
    where: { email: 'admin@nts.com' }
  });
  if (!admin) {
    throw new Error('User admin@nts.com not found');
  }

  let vendor = await prisma.vendor.findFirst({ where: { isActive: true } });
  if (!vendor) {
    vendor = await prisma.vendor.create({
      data: {
        name: 'Test Vendor',
        email: 'vendor@test.com',
        isActive: true
      }
    });
    console.log('Created test vendor:', vendor.id);
  }

  const currency = await prisma.currency.findFirst({
    where: { code: 'USD' }
  }) || await prisma.currency.findFirst({ where: { isActive: true } });
  if (!currency) {
    throw new Error('No currency found');
  }

  const invoiceNumber = `PROC-TEST-${Date.now()}`;
  const subtotal = 1000;
  const taxAmount = 150;
  const totalAmount = 1150;

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
        create: [
          {
            itemName: 'Test item',
            quantity: new Decimal(1),
            unitPrice: new Decimal(subtotal),
            totalPrice: new Decimal(subtotal),
            matchStatus: 'PENDING'
          }
        ]
      }
    },
    include: {
      vendor: true,
      currency: true,
      items: true
    }
  });

  console.log('Created procurement invoice:');
  console.log('  id:', invoice.id);
  console.log('  invoiceNumber:', invoice.invoiceNumber);
  console.log('  vendor:', invoice.vendor.name);
  console.log('  totalAmount:', invoice.totalAmount.toString());
  console.log('  status:', invoice.status);
  console.log('\nPay via API (procurement pay endpoint) or ProcurementService.payProcurementInvoice(invoice.id, { paymentAmount, paymentDate, paymentMethod: "BANK", bankAccountId, ... }, userId).');
  console.log('Cleanup test data: npx ts-node scripts/cleanup-procurement-cashbook-test.ts');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
