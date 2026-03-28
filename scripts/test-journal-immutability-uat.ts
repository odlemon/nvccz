/**
 * UAT: posted/voided journal entries reject updates (JournalEntryImmutableError).
 * Run: npx ts-node --transpile-only scripts/test-journal-immutability-uat.ts
 */
import { prisma } from '../src/utils/database';
import JournalEntryService, {
  JournalEntryImmutableError,
} from '../src/services/JournalEntryService';

async function main() {
  console.log('========== Journal immutability UAT ==========\n');

  const posted = await prisma.journalEntry.findFirst({
    where: { status: 'POSTED' },
    select: { id: true, referenceNumber: true, status: true },
  });

  if (!posted) {
    console.log('SKIP: No POSTED journal entry in DB — cannot assert immutability rejection.');
    await prisma.$disconnect();
    return;
  }

  const voided = await prisma.journalEntry.findFirst({
    where: { status: 'VOID' },
    select: { id: true, referenceNumber: true, status: true },
  });

  const dummyLines = [
    {
      chartOfAccountId: 'dummy-will-not-run',
      debitAmount: 1,
      creditAmount: 0,
      description: 'x',
    },
    {
      chartOfAccountId: 'dummy-will-not-run',
      debitAmount: 0,
      creditAmount: 1,
      description: 'x',
    },
  ];

  const baseParams = {
    transactionDate: new Date(),
    referenceNumber: 'SHOULD-NOT-APPLY',
    description: 'should not apply',
    currencyId: '00000000-0000-0000-0000-000000000000',
    journalEntryLines: dummyLines,
    createdById: 'system',
  };

  let passed = 0;

  try {
    await JournalEntryService.updatePendingJournalEntry(posted.id, baseParams, 'system');
    console.log('FAIL: updatePendingJournalEntry should have thrown for POSTED', posted.referenceNumber);
    process.exitCode = 1;
  } catch (e) {
    if (e instanceof JournalEntryImmutableError) {
      console.log('OK: POSTED journal rejected:', posted.referenceNumber);
      console.log('   ', e.message);
      passed++;
    } else {
      console.log('FAIL: expected JournalEntryImmutableError for POSTED, got:', e);
      process.exitCode = 1;
    }
  }

  if (voided) {
    try {
      await JournalEntryService.updatePendingJournalEntry(voided.id, baseParams, 'system');
      console.log('FAIL: update should have thrown for VOID', voided.referenceNumber);
      process.exitCode = 1;
    } catch (e) {
      if (e instanceof JournalEntryImmutableError) {
        console.log('OK: VOID journal rejected:', voided.referenceNumber);
        passed++;
      } else {
        console.log('FAIL: expected JournalEntryImmutableError for VOID, got:', e);
        process.exitCode = 1;
      }
    }
  } else {
    console.log('(No VOID journal in DB — skipped VOID case.)');
  }

  console.log('\n========== Summary ==========');
  console.log(`Checks passed: ${passed}`);
  console.log(
    '\nNote: Immutability is enforced in JournalEntryService.updatePendingJournalEntry.'
  );
  console.log(
    'API: PATCH /api/accounting/journal-entries/:id returns 409 with the same message for POSTED/VOID.'
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
