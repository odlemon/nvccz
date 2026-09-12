/**
 * Align linked cashbook + journal `transaction_date` with a vendor bill after correcting dates in app/DB.
 * Uses COALESCE(payment_date, invoice_date) on the purchase invoice as the target date.
 *
 * Run: npx ts-node scripts/sync-purchase-invoice-ledger-dates-from-bill.ts PINV-2026-073
 *   or: npm run db:repair:vendor-bill-ledger-dates -- PINV-2026-073
 *
 * Target timestamp = payment_date if set, else invoice_date. If you only corrected invoice_date in SQL,
 * also set payment_date (or null it) so the target is not stuck on an old payment_date.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const invoiceNumber = process.argv[2]?.trim();
  if (!invoiceNumber) {
    console.error("Usage: npx ts-node scripts/sync-purchase-invoice-ledger-dates-from-bill.ts <invoiceNumber>");
    process.exit(1);
  }

  const pi = await prisma.purchaseInvoice.findUnique({
    where: { invoiceNumber },
    select: {
      id: true,
      invoiceNumber: true,
      invoiceDate: true,
      paymentDate: true,
      journalEntryId: true,
      paymentJournalEntryId: true,
      cashbookEntryId: true,
    },
  });

  if (!pi) {
    console.error(`Purchase invoice not found: ${invoiceNumber}`);
    process.exit(1);
  }

  console.log(
    `Bill dates: invoiceDate=${pi.invoiceDate.toISOString()} paymentDate=${pi.paymentDate?.toISOString() ?? "null"}`
  );
  const target = pi.paymentDate ?? pi.invoiceDate;
  console.log(`Applying target transactionDate=${target.toISOString()} (paymentDate ?? invoiceDate)`);
  const ids = new Set<string>();
  if (pi.journalEntryId) ids.add(pi.journalEntryId);
  if (pi.paymentJournalEntryId) ids.add(pi.paymentJournalEntryId);

  for (const jeId of ids) {
    await prisma.journalEntry.update({
      where: { id: jeId },
      data: { transactionDate: target },
    });
    console.log(`[ok] journal_entries.transaction_date → ${target.toISOString()} (${jeId})`);
  }

  if (pi.cashbookEntryId) {
    await prisma.cashbookEntry.update({
      where: { id: pi.cashbookEntryId },
      data: { transactionDate: target },
    });
    console.log(`[ok] cashbook_entries.transaction_date → ${target.toISOString()} (${pi.cashbookEntryId})`);
  }

  console.log(`Done for ${pi.invoiceNumber}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
