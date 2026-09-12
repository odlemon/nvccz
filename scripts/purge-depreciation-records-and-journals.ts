#!/usr/bin/env ts-node
/**
 * DESTRUCTIVE: Deletes all DepreciationRecord rows and their posted JournalEntry rows
 * (reference DEP-{YYYY-MM}-{idSuffix}, description "Depreciation for …").
 * Also removes any orphan depreciation JEs matching the same patterns (e.g. ref drift).
 *
 * Resets each affected Asset.currentBookValue to cost (GL balances are NOT auto-reversed;
 * run adjusting journals separately if books must tie out).
 *
 * **Why journals sometimes "would not delete":**
 * 1. Another app holds row locks (stop `npm run dev` / Prisma Studio first).
 * 2. MySQL foreign keys from *other* modules (invoice, expense, cashbook, …) pointing at the
 *    same `journal_entries.id` — this script now nulls/deletes those links before removing lines + headers.
 *
 * Usage: npx ts-node --transpile-only scripts/purge-depreciation-records-and-journals.ts
 */
import { prisma } from "../src/utils/database";

function depReferenceForRecord(id: string, period: string) {
  return `DEP-${period}-${id.slice(-8)}`;
}

/** Clear every optional FK in this schema that references `journal_entries.id` (depreciation JEs are rarely linked, but MySQL RESTRICT will block delete otherwise). */
async function detachAllReferencesToJournalEntries(journalIds: string[]) {
  if (journalIds.length === 0) return;

  await prisma.bankTransaction.updateMany({
    where: { matchedJournalEntryId: { in: journalIds } },
    data: { matchedJournalEntryId: null, isMatched: false }
  });

  await prisma.reconciliationResult.deleteMany({
    where: { journalEntryId: { in: journalIds } }
  });

  await prisma.recurringJournalRun.deleteMany({
    where: { journalEntryId: { in: journalIds } }
  });

  await prisma.expense.updateMany({
    where: { journalEntryId: { in: journalIds } },
    data: { journalEntryId: null }
  });

  await prisma.revenue.updateMany({
    where: { journalEntryId: { in: journalIds } },
    data: { journalEntryId: null }
  });

  await prisma.invoice.updateMany({
    where: { journalEntryId: { in: journalIds } },
    data: { journalEntryId: null }
  });

  await prisma.procurementInvoice.updateMany({
    where: { journalEntryId: { in: journalIds } },
    data: { journalEntryId: null }
  });

  await prisma.purchaseInvoice.updateMany({
    where: { journalEntryId: { in: journalIds } },
    data: { journalEntryId: null }
  });

  await prisma.purchaseInvoice.updateMany({
    where: { paymentJournalEntryId: { in: journalIds } },
    data: { paymentJournalEntryId: null }
  });

  await prisma.creditNote.updateMany({
    where: { journalEntryId: { in: journalIds } },
    data: { journalEntryId: null }
  });

  await prisma.forexGainLoss.updateMany({
    where: { journalEntryId: { in: journalIds } },
    data: { journalEntryId: null }
  });

  await prisma.cashbookEntry.updateMany({
    where: { journalEntryId: { in: journalIds } },
    data: { journalEntryId: null }
  });
}

async function main() {
  const records = await prisma.depreciationRecord.findMany({
    select: { id: true, period: true, assetId: true }
  });

  const refsFromRecords = [...new Set(records.map((r) => depReferenceForRecord(r.id, r.period)))];

  const orphanStyle = await prisma.journalEntry.findMany({
    where: {
      referenceNumber: { startsWith: "DEP-" },
      description: { startsWith: "Depreciation for " }
    },
    select: { id: true, referenceNumber: true }
  });

  const journalIds = new Set<string>();
  if (refsFromRecords.length > 0) {
    const byRef = await prisma.journalEntry.findMany({
      where: { referenceNumber: { in: refsFromRecords } },
      select: { id: true }
    });
    for (const row of byRef) journalIds.add(row.id);
  }
  for (const row of orphanStyle) {
    journalIds.add(row.id);
  }

  const ids = [...journalIds];

  console.log(
    JSON.stringify(
      {
        depreciationRecordCount: records.length,
        computedRefs: refsFromRecords.length,
        depreciationJournalEntriesFound: ids.length,
        distinctAssetsInRecords: new Set(records.map((r) => r.assetId)).size
      },
      null,
      2
    )
  );

  if (records.length === 0 && ids.length === 0) {
    console.log("Nothing to purge.");
    return;
  }

  try {
    await prisma.$executeRawUnsafe("SET SESSION innodb_lock_wait_timeout = 120");
  } catch {
    /* non-MySQL or no permission */
  }

  const chunkSize = Math.max(1, Math.min(50, Number(process.env.PURGE_DEPR_CHUNK) || 25));
  let journalsDeleted = 0;

  if (ids.length > 0) {
    await detachAllReferencesToJournalEntries(ids);

    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      await prisma.journalEntryLine.deleteMany({
        where: { journalEntryId: { in: chunk } }
      });
      const del = await prisma.journalEntry.deleteMany({ where: { id: { in: chunk } } });
      journalsDeleted += del.count;
    }
  }

  const dr = await prisma.depreciationRecord.deleteMany({});

  const assetIds = [...new Set(records.map((r) => r.assetId))];
  let assetsReset = 0;
  for (const aid of assetIds) {
    const asset = await prisma.asset.findUnique({
      where: { id: aid },
      select: { id: true, cost: true }
    });
    if (asset) {
      await prisma.asset.update({
        where: { id: aid },
        data: { currentBookValue: asset.cost }
      });
      assetsReset += 1;
    }
  }

  const summary = {
    depreciationRecordsDeleted: dr.count,
    journalsDeleted,
    assetsReset
  };

  console.log("Done:", summary);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
