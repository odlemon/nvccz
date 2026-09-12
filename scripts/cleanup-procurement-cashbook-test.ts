// @ts-nocheck
/**
 * Cleanup test data: procurement invoices created for cashbook testing (PROC-TEST-*),
 * their cashbook entries, and related journal entries.
 * Run: npx ts-node scripts/cleanup-procurement-cashbook-test.ts
 */
import { prisma } from '../src/utils/database';

async function main() {
  console.log('Cleaning up procurement cashbook test data...\n');

  const testInvoices = await prisma.procurementInvoice.findMany({
    where: { invoiceNumber: { startsWith: 'PROC-TEST-' } },
    include: { cashbookEntry: true, journalEntry: true }
  });

  if (testInvoices.length === 0) {
    console.log('No PROC-TEST-* invoices found. Nothing to clean.');
    await prisma.$disconnect();
    return;
  }

  for (const inv of testInvoices) {
    const cashbookId = inv.cashbookEntryId;
    const journalId = inv.journalEntryId;
    const cashbookEntry = inv.cashbookEntry;

    // Unlink invoice from cashbook so we can delete cashbook
    await prisma.procurementInvoice.update({
      where: { id: inv.id },
      data: { cashbookEntryId: null, journalEntryId: null }
    });

    await prisma.procurementInvoiceItem.deleteMany({ where: { invoiceId: inv.id } });
    await prisma.procurementInvoice.delete({ where: { id: inv.id } });
    console.log('Deleted invoice:', inv.invoiceNumber);

    if (cashbookEntry) {
      const paymentJeId = cashbookEntry.journalEntryId;
      await prisma.cashbookEntry.update({
        where: { id: cashbookEntry.id },
        data: { journalEntryId: null }
      });
      if (paymentJeId) {
        await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: paymentJeId } });
        await prisma.journalEntry.delete({ where: { id: paymentJeId } }).catch(() => null);
        console.log('  Deleted payment JE:', paymentJeId);
      }
      await prisma.cashbookEntry.delete({ where: { id: cashbookEntry.id } });
      console.log('  Deleted cashbook entry:', cashbookEntry.id);
    }

    if (journalId && journalId !== cashbookEntry?.journalEntryId) {
      await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: journalId } });
      await prisma.journalEntry.delete({ where: { id: journalId } });
      console.log('  Deleted expense JE:', journalId);
    }
  }

  console.log('\nCleanup done.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
