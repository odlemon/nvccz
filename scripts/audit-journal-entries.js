// @ts-nocheck
/**
 * Audit Script: Find Journal Entry Issues
 * Run with: node scripts/audit-journal-entries.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findCreditNotesWithoutJournalEntries() {
  console.log('\n========================================');
  console.log('1. CREDIT NOTES WITHOUT JOURNAL ENTRIES');
  console.log('========================================\n');

  const creditNotes = await prisma.creditNote.findMany({
    where: {
      OR: [
        { journalEntryId: null },
        {
          journalEntry: {
            is: null
          }
        }
      ]
    },
    include: {
      customer: {
        select: { name: true }
      }
    }
  });

  if (creditNotes.length === 0) {
    console.log('✅ No credit notes without journal entries found.\n');
  } else {
    console.log(`❌ Found ${creditNotes.length} credit notes without journal entries:\n`);
    creditNotes.forEach(cn => {
      console.log(`- ID: ${cn.id}`);
      console.log(`  Credit Note #: ${cn.creditNoteNumber}`);
      console.log(`  Amount: ${cn.totalAmount}`);
      console.log(`  Customer: ${cn.customer?.name || 'N/A'}`);
      console.log(`  Created: ${cn.createdAt}`);
      console.log(`  Status: ${cn.status}`);
      console.log('');
    });
  }

  return creditNotes.length;
}

async function findJournalEntriesWithoutLines() {
  console.log('\n========================================');
  console.log('2. JOURNAL ENTRIES WITHOUT LINES');
  console.log('========================================\n');

  const journalEntries = await prisma.journalEntry.findMany({
    include: {
      journalEntryLines: true
    }
  });

  const entriesWithoutLines = journalEntries.filter(je => je.journalEntryLines.length === 0);

  if (entriesWithoutLines.length === 0) {
    console.log('✅ No journal entries without lines found.\n');
  } else {
    console.log(`❌ Found ${entriesWithoutLines.length} journal entries without lines:\n`);
    entriesWithoutLines.forEach(je => {
      console.log(`- ID: ${je.id}`);
      console.log(`  Reference: ${je.referenceNumber}`);
      console.log(`  Description: ${je.description}`);
      console.log(`  Amount: ${je.totalAmount}`);
      console.log(`  Date: ${je.transactionDate}`);
      console.log(`  Status: ${je.status}`);
      console.log('');
    });
  }

  return entriesWithoutLines.length;
}

async function findUnbalancedJournalEntries() {
  console.log('\n========================================');
  console.log('3. UNBALANCED JOURNAL ENTRIES');
  console.log('========================================\n');

  const journalEntries = await prisma.journalEntry.findMany({
    where: {
      status: { not: 'VOID' } // Exclude voided entries
    },
    include: {
      journalEntryLines: true
    }
  });

  const unbalanced = [];

  journalEntries.forEach(je => {
    const totalDebits = je.journalEntryLines.reduce(
      (sum, line) => sum + Number(line.debitAmount || 0), 
      0
    );
    const totalCredits = je.journalEntryLines.reduce(
      (sum, line) => sum + Number(line.creditAmount || 0), 
      0
    );
    const difference = Math.abs(totalDebits - totalCredits);

    if (difference > 0.01) {
      unbalanced.push({
        ...je,
        totalDebits,
        totalCredits,
        difference
      });
    }
  });

  if (unbalanced.length === 0) {
    console.log('✅ No unbalanced journal entries found.\n');
  } else {
    console.log(`❌ Found ${unbalanced.length} unbalanced journal entries:\n`);
    unbalanced.forEach(je => {
      console.log(`- ID: ${je.id}`);
      console.log(`  Reference: ${je.referenceNumber}`);
      console.log(`  Description: ${je.description}`);
      console.log(`  Total Debits: $${je.totalDebits.toFixed(2)}`);
      console.log(`  Total Credits: $${je.totalCredits.toFixed(2)}`);
      console.log(`  Difference: $${je.difference.toFixed(2)} ⚠️`);
      console.log(`  Date: ${je.transactionDate}`);
      console.log('');
    });
  }

  return unbalanced.length;
}

async function findArToArCreditNoteApplications() {
  console.log('\n========================================');
  console.log('4. AR-TO-AR CREDIT NOTE APPLICATIONS');
  console.log('========================================\n');

  const journalEntries = await prisma.journalEntry.findMany({
    where: {
      referenceNumber: {
        contains: 'CN-APPLY'
      },
      status: { not: 'VOID' } // Exclude voided entries
    },
    include: {
      journalEntryLines: {
        include: {
          chartOfAccount: true
        }
      }
    }
  });

  const arToArEntries = [];

  journalEntries.forEach(je => {
    const uniqueAccounts = new Set();
    je.journalEntryLines.forEach(line => {
      uniqueAccounts.add(line.chartOfAccountId);
    });

    // If only one unique account is used, it's meaningless (AR to AR)
    if (uniqueAccounts.size === 1 && je.journalEntryLines.length > 0) {
      arToArEntries.push(je);
    }
  });

  if (arToArEntries.length === 0) {
    console.log('✅ No AR-to-AR credit note application entries found.\n');
  } else {
    console.log(`❌ Found ${arToArEntries.length} meaningless AR-to-AR entries:\n`);
    arToArEntries.forEach(je => {
      const accountName = je.journalEntryLines[0]?.chartOfAccount?.accountName || 'Unknown';
      console.log(`- ID: ${je.id}`);
      console.log(`  Reference: ${je.referenceNumber}`);
      console.log(`  Description: ${je.description}`);
      console.log(`  Amount: ${je.totalAmount}`);
      console.log(`  Account Used: ${accountName} (BOTH debit and credit)`);
      console.log(`  Date: ${je.transactionDate}`);
      console.log(`  Status: ${je.status}`);
      console.log(`  Net Effect: $0 (meaningless!) ⚠️`);
      console.log('');
    });
  }

  return arToArEntries.length;
}

async function generateSummary(results) {
  console.log('\n========================================');
  console.log('SUMMARY REPORT');
  console.log('========================================\n');

  const totalIssues = Object.values(results).reduce((sum, count) => sum + count, 0);

  console.log('Issue Counts:');
  console.log(`  - Credit notes without journal entries: ${results.creditNotesNoJE}`);
  console.log(`  - Journal entries without lines: ${results.journalEntriesNoLines}`);
  console.log(`  - Unbalanced journal entries: ${results.unbalancedEntries}`);
  console.log(`  - AR-to-AR application entries: ${results.arToArEntries}`);
  console.log('\n' + '='.repeat(40));
  console.log(`  TOTAL ISSUES FOUND: ${totalIssues}`);
  console.log('='.repeat(40) + '\n');

  if (totalIssues === 0) {
    console.log('✅ ✅ ✅ EXCELLENT! Your accounting data is clean! ✅ ✅ ✅\n');
  } else {
    console.log('⚠️  ACTION REQUIRED: Please review the issues above.');
    console.log('⚠️  See documentation for cleanup options.\n');
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  JOURNAL ENTRY AUDIT SCRIPT            ║');
  console.log('║  Date: ' + new Date().toISOString().split('T')[0] + '                      ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    const results = {
      creditNotesNoJE: await findCreditNotesWithoutJournalEntries(),
      journalEntriesNoLines: await findJournalEntriesWithoutLines(),
      unbalancedEntries: await findUnbalancedJournalEntries(),
      arToArEntries: await findArToArCreditNoteApplications()
    };

    await generateSummary(results);

    console.log('✅ Audit completed successfully.\n');
    console.log('📝 For cleanup options, see: find-missing-journal-entries.sql\n');

  } catch (error) {
    console.error('\n❌ Error running audit:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the audit
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

