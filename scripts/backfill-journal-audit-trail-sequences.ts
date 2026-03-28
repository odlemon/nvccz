// @ts-nocheck
/**
 * Assign auditTrailSequenceNumber to journal rows that are still null.
 * Orders by createdAt so older rows get lower numbers after the current max.
 * Syncs audit_trail_sequences.journal_entry to the last assigned value.
 *
 * Run: npx ts-node scripts/backfill-journal-audit-trail-sequences.ts
 */
import { prisma } from '../src/utils/database';

const SEQUENCE_NAME = 'journal_entry';
const INITIAL_VALUE = 1000;

async function main() {
  const agg = await prisma.journalEntry.aggregate({
    _max: { auditTrailSequenceNumber: true },
  });
  let seq = agg._max.auditTrailSequenceNumber ?? INITIAL_VALUE;

  const nullRows = await prisma.journalEntry.findMany({
    where: { auditTrailSequenceNumber: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, referenceNumber: true, createdAt: true },
  });

  if (nullRows.length === 0) {
    console.log('No journal entries with null auditTrailSequenceNumber.');
    await prisma.$disconnect();
    return;
  }

  console.log(`Backfilling ${nullRows.length} journal(s), starting after sequence ${seq}...`);

  await prisma.$transaction(async (tx) => {
    for (const row of nullRows) {
      seq += 1;
      await tx.journalEntry.update({
        where: { id: row.id },
        data: { auditTrailSequenceNumber: seq },
      });
    }
    await tx.auditTrailSequence.upsert({
      where: { name: SEQUENCE_NAME },
      create: { name: SEQUENCE_NAME, value: seq },
      update: { value: seq },
    });
  });

  console.log(`Done. Last assigned auditTrailSequenceNumber: ${seq}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
