// @ts-nocheck
/**
 * Scan every journal entry with auditTrailSequenceNumber set.
 * Reports min/max/count and any gaps in the integer sequence (ascending).
 *
 * Run: npx ts-node scripts/check-all-audit-trail-sequences.ts
 */
import { prisma } from '../src/utils/database';

async function main() {
  const rows = await prisma.journalEntry.findMany({
    where: { auditTrailSequenceNumber: { not: null } },
    orderBy: { auditTrailSequenceNumber: 'asc' },
    select: {
      id: true,
      auditTrailSequenceNumber: true,
      referenceNumber: true,
      status: true,
      createdAt: true
    }
  });

  const nums = rows
    .map((r) => r.auditTrailSequenceNumber as number)
    .filter((n) => n != null);

  console.log('========== All journal audit trail sequence numbers ==========\n');
  console.log('Count (with number assigned):', nums.length);
  if (nums.length === 0) {
    console.log('No journal entries have auditTrailSequenceNumber set.');
    await prisma.$disconnect();
    return;
  }

  const min = nums[0];
  const max = nums[nums.length - 1];
  console.log('Min:', min, '| Max:', max, '| Span:', max - min + 1);

  const gaps: { after: number; missing: number }[] = [];
  const duplicates: number[] = [];
  const seen = new Set<number>();

  for (let i = 0; i < nums.length; i++) {
    const n = nums[i];
    if (seen.has(n)) duplicates.push(n);
    seen.add(n);
    if (i === 0) continue;
    const prev = nums[i - 1];
    if (n === prev) continue;
    if (n < prev) {
      console.warn('Unexpected order: non-ascending at index', i, prev, n);
      continue;
    }
    if (n !== prev + 1) {
      for (let missing = prev + 1; missing < n; missing++) {
        gaps.push({ after: prev, missing });
      }
    }
  }

  if (duplicates.length > 0) {
    console.log('\n*** DUPLICATE sequence numbers:', [...new Set(duplicates)].join(', '));
  } else {
    console.log('\nDuplicates: none');
  }

  if (gaps.length === 0) {
    console.log('Gaps: none — all assigned numbers form one contiguous range from min to max.');
    console.log('\nRESULT: Sequential (no gaps among numbered entries).');
  } else {
    console.log('\n*** GAPS (expected integer missing between two assigned numbers):');
    const uniqueMissing = [...new Set(gaps.map((g) => g.missing))].sort((a, b) => a - b);
    console.log('Missing count:', uniqueMissing.length);
    console.log(
      'Missing values (first 50):',
      uniqueMissing.slice(0, 50).join(', ') + (uniqueMissing.length > 50 ? ' ...' : '')
    );
    console.log('\nRESULT: NOT fully sequential — gaps exist.');
  }

  // Journals without audit number (informational)
  const without = await prisma.journalEntry.count({
    where: { auditTrailSequenceNumber: null }
  });
  console.log('\nJournal entries with NO audit trail number:', without);
  console.log('(Those are excluded from the sequence check above.)\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
