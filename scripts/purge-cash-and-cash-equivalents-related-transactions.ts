// @ts-nocheck
/**
 * Targeted DEV cleanup: delete transactions that hit the "Cash and Cash Equivalents" CoA.
 *
 * IMPORTANT:
 * - This is intentionally NOT a full accounting reset.
 * - It only removes documents/journals that posted against the CACE account(s),
 *   so other clean test data remains.
 *
 * Safety:
 * - Requires env `ALLOW_CACE_PURGE=1`
 *
 * Run:
 *   ALLOW_CACE_PURGE=1 npx ts-node scripts/purge-cash-and-cash-equivalents-related-transactions.ts
 *   ALLOW_CACE_PURGE=1 npm run db:purge:cace-related
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function requireFlag(name: string) {
  const v = (process.env[name] ?? "").trim();
  if (v !== "1") {
    throw new Error(`Refusing to run: set ${name}=1 to proceed.`);
  }
}

async function main() {
  requireFlag("ALLOW_CACE_PURGE");

  // Identify the CACE posting accounts.
  const caceAccounts = await prisma.chartOfAccounts.findMany({
    where: {
      OR: [
        { accountNo: "1000" },
        { accountName: { contains: "Cash and Cash Equivalents" } },
        { accountName: { contains: "Cash & Cash Equivalents" } },
      ],
    },
    select: { id: true, accountNo: true, accountName: true },
  });

  if (caceAccounts.length === 0) {
    console.log("No CACE chart-of-accounts rows found (1000 / name match). Nothing to purge.");
    return;
  }

  console.log("CACE accounts:");
  for (const a of caceAccounts) console.log(`  - ${a.accountNo} ${a.accountName} (${a.id})`);

  // Find all journals that posted to any CACE account line.
  const lines = await prisma.journalEntryLine.findMany({
    where: { chartOfAccountId: { in: caceAccounts.map((a) => a.id) } },
    select: { journalEntryId: true },
  });
  const journalEntryIds = [...new Set(lines.map((l) => l.journalEntryId))];

  if (journalEntryIds.length === 0) {
    console.log("No journal_entry_lines reference CACE accounts. Nothing to purge.");
    return;
  }

  console.log(`Found ${journalEntryIds.length} journal entries touching CACE.`);

  // Delete in FK-safe order (documents first, then journal headers; lines cascade from header).
  // We do this in chunks to avoid Prisma interactive transaction timeout (default ~5s on some DBs).
  const CHUNK = 250;
  const totals = {
    cashbookEntriesDeleted: 0,
    paymentAllocationsDeleted: 0,
    vendorBillPaymentsDeleted: 0,
    invoicesDeleted: 0,
    purchaseInvoicesDeleted: 0,
    expensesDeleted: 0,
    revenuesDeleted: 0,
    forexGainLossDeleted: 0,
    creditNotesDeleted: 0,
    journalEntriesDeleted: 0,
  };

  for (let i = 0; i < journalEntryIds.length; i += CHUNK) {
    const chunkIds = journalEntryIds.slice(i, i + CHUNK);
    const result = await prisma.$transaction(
      async (tx) => {
        const cashbook = await tx.cashbookEntry.findMany({
          where: { journalEntryId: { in: chunkIds } },
          select: { id: true },
        });
        const cashbookIds = cashbook.map((c) => c.id);

        const inv = await tx.invoice.findMany({
          where: { journalEntryId: { in: chunkIds } },
          select: { id: true },
        });
        const invoiceIds = inv.map((i) => i.id);

        const pinv = await tx.purchaseInvoice.findMany({
          where: {
            OR: [
              { journalEntryId: { in: chunkIds } },
              { paymentJournalEntryId: { in: chunkIds } },
            ],
          },
          select: { id: true },
        });
        const purchaseInvoiceIds = pinv.map((p) => p.id);

        const delPaymentAlloc = invoiceIds.length
          ? await tx.paymentAllocation.deleteMany({ where: { invoiceId: { in: invoiceIds } } })
          : { count: 0 };

        // PurchaseInvoicePayment.cashbookEntry has onDelete: Restrict, so remove those before deleting cashbook entries.
        const delVendorBillPayments = cashbookIds.length
          ? await tx.purchaseInvoicePayment.deleteMany({ where: { cashbookEntryId: { in: cashbookIds } } })
          : { count: 0 };

        const delCashbook = cashbookIds.length
          ? await tx.cashbookEntry.deleteMany({ where: { id: { in: cashbookIds } } })
          : { count: 0 };

        const delInvoices = invoiceIds.length
          ? await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } })
          : { count: 0 };

        const delPurchaseInvoices = purchaseInvoiceIds.length
          ? await tx.purchaseInvoice.deleteMany({ where: { id: { in: purchaseInvoiceIds } } })
          : { count: 0 };

        const delExpenses = await tx.expense.deleteMany({
          where: { journalEntryId: { in: chunkIds } },
        });
        const delRevenues = await tx.revenue.deleteMany({
          where: { journalEntryId: { in: chunkIds } },
        });
        const delForex = await tx.forexGainLoss.deleteMany({
          where: { journalEntryId: { in: chunkIds } },
        });
        const delCreditNotes = await tx.creditNote.deleteMany({
          where: { journalEntryId: { in: chunkIds } },
        });

        const delJournalEntries = await tx.journalEntry.deleteMany({
          where: { id: { in: chunkIds } },
        });

        return {
          cashbookEntriesDeleted: delCashbook.count,
          paymentAllocationsDeleted: delPaymentAlloc.count,
          vendorBillPaymentsDeleted: delVendorBillPayments.count,
          invoicesDeleted: delInvoices.count,
          purchaseInvoicesDeleted: delPurchaseInvoices.count,
          expensesDeleted: delExpenses.count,
          revenuesDeleted: delRevenues.count,
          forexGainLossDeleted: delForex.count,
          creditNotesDeleted: delCreditNotes.count,
          journalEntriesDeleted: delJournalEntries.count,
        };
      },
      { maxWait: 10_000, timeout: 60_000 }
    );

    totals.cashbookEntriesDeleted += result.cashbookEntriesDeleted;
    totals.paymentAllocationsDeleted += result.paymentAllocationsDeleted;
    // @ts-ignore
    totals.vendorBillPaymentsDeleted = (totals as any).vendorBillPaymentsDeleted ?? 0;
    // @ts-ignore
    totals.vendorBillPaymentsDeleted += (result as any).vendorBillPaymentsDeleted ?? 0;
    totals.invoicesDeleted += result.invoicesDeleted;
    totals.purchaseInvoicesDeleted += result.purchaseInvoicesDeleted;
    totals.expensesDeleted += result.expensesDeleted;
    totals.revenuesDeleted += result.revenuesDeleted;
    totals.forexGainLossDeleted += result.forexGainLossDeleted;
    totals.creditNotesDeleted += result.creditNotesDeleted;
    totals.journalEntriesDeleted += result.journalEntriesDeleted;

    if ((i / CHUNK) % 5 === 0) {
      console.log(`...purged chunk ${i}–${Math.min(i + CHUNK, journalEntryIds.length)} / ${journalEntryIds.length}`);
    }
  }

  console.log("\nPurge summary (CACE-related):");
  console.log(JSON.stringify(totals, null, 2));
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

