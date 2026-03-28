/**
 * UAT: Tax invoice 100.00 ZiG (ZWL) net → VAT 15.5% = 15.50 → total 115.50 (separate vatAmount on invoice).
 * Run: npx ts-node scripts/test-vat-tax-invoice-zig-uat.ts
 */
// @ts-nocheck
import { prisma } from '../src/utils/database';
import { InvoiceService } from '../src/services/InvoiceService';
import VATService from '../src/services/VATService';

async function main() {
  console.log('=== UAT: Tax invoice 100 ZiG + 15.5% VAT ===\n');
  if (VATService.getVATRate() !== 15.5) {
    throw new Error(`Expected default VAT rate 15.5%, got ${VATService.getVATRate()}`);
  }

  const zig = await prisma.currency.findFirst({
    where: { code: { in: ['ZWL', 'ZWG', 'ZIG'] }, isActive: true },
    orderBy: { code: 'asc' },
  });
  if (!zig) {
    throw new Error('No ZWL/ZWG/ZIG currency — add one for ZiG invoice UAT');
  }

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } },
  });
  const customer = await prisma.customer.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!admin || !customer) {
    throw new Error('Need admin user and at least one active customer');
  }

  const net = 100;
  const inv = await InvoiceService.createInvoice({
    customerId: customer.id,
    amount: net,
    currencyId: zig.id,
    transactionDate: new Date(),
    description: `UAT tax invoice ${net} ${zig.code} + VAT 15.5%`,
    isTaxable: true,
    createdById: admin.id,
    items: [{ description: 'UAT line', quantity: 1, unitPrice: net }],
  });

  const vat = Number(inv.vatAmount);
  const total = Number(inv.totalAmount);
  const base = Number(inv.amount);

  console.log('Currency:', zig.code, zig.id);
  console.log('amount (net):', base, '| vatAmount:', vat, '| totalAmount:', total);
  console.log('isTaxable:', inv.isTaxable);

  if (base !== net) throw new Error(`Expected net ${net}, got ${base}`);
  if (vat !== 15.5) throw new Error(`Expected VAT 15.50, got ${vat}`);
  if (total !== 115.5) throw new Error(`Expected total 115.50, got ${total}`);

  console.log('\nPASS — VAT separated (vatAmount field), total includes tax.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
