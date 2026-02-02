import { prisma } from '../src/utils/database';

async function checkFebruaryDataDetailed() {
  console.log('🔍 Detailed check for February data in accounting module...\n');

  try {
    const now = new Date();
    console.log(`📅 Current Date: ${now.toISOString()}`);
    console.log(`📅 Current Year: ${now.getFullYear()}, Month: ${now.getMonth() + 1}, Day: ${now.getDate()}\n`);

    // Check for ANY February data (2025 or 2026)
    const feb2025Start = new Date('2025-02-01T00:00:00.000Z');
    const feb2025End = new Date('2025-02-28T23:59:59.999Z');
    const feb2026Start = new Date('2026-02-01T00:00:00.000Z');
    const feb2026End = new Date('2026-02-28T23:59:59.999Z');

    console.log('='.repeat(80));
    console.log('📊 JOURNAL ENTRIES - Detailed Check');
    console.log('='.repeat(80));

    // Get ALL journal entries and check their dates
    const allJournalEntries = await prisma.journalEntry.findMany({
      select: {
        id: true,
        referenceNumber: true,
        transactionDate: true,
        status: true,
        description: true,
        createdAt: true
      },
      orderBy: { transactionDate: 'desc' },
      take: 100 // Get recent 100 entries
    });

    console.log(`\n📋 Total Journal Entries checked: ${allJournalEntries.length}`);
    
    const feb2025JEs = allJournalEntries.filter(je => {
      const date = new Date(je.transactionDate);
      return date >= feb2025Start && date <= feb2025End;
    });

    const feb2026JEs = allJournalEntries.filter(je => {
      const date = new Date(je.transactionDate);
      return date >= feb2026Start && date <= feb2026End;
    });

    console.log(`📋 February 2025 Journal Entries: ${feb2025JEs.length}`);
    if (feb2025JEs.length > 0) {
      feb2025JEs.forEach((je, idx) => {
        console.log(`  ${idx + 1}. ${je.referenceNumber} - ${je.transactionDate.toISOString().split('T')[0]} - ${je.status}`);
        console.log(`     Description: ${je.description?.substring(0, 60) || 'N/A'}`);
      });
    }

    console.log(`\n📋 February 2026 Journal Entries: ${feb2026JEs.length}`);
    if (feb2026JEs.length > 0) {
      feb2026JEs.forEach((je, idx) => {
        console.log(`  ${idx + 1}. ${je.referenceNumber} - ${je.transactionDate.toISOString().split('T')[0]} - ${je.status}`);
        console.log(`     Description: ${je.description?.substring(0, 60) || 'N/A'}`);
      });
    }

    // Check for entries with dates that might be parsed as February
    console.log('\n🔍 Checking for entries with suspicious dates...');
    const suspiciousDates = allJournalEntries.filter(je => {
      const date = new Date(je.transactionDate);
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      // Check if date is in February of any year
      return month === 2;
    });

    if (suspiciousDates.length > 0) {
      console.log(`\n⚠️  Found ${suspiciousDates.length} entries with February dates:`);
      suspiciousDates.slice(0, 10).forEach((je, idx) => {
        const date = new Date(je.transactionDate);
        console.log(`  ${idx + 1}. ${je.referenceNumber} - ${date.toISOString()} (${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')})`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('💰 CASHBOOK ENTRIES - Detailed Check');
    console.log('='.repeat(80));

    const allCashbookEntries = await prisma.cashbookEntry.findMany({
      select: {
        id: true,
        reference: true,
        transactionDate: true,
        status: true,
        type: true,
        amount: true,
        description: true
      },
      orderBy: { transactionDate: 'desc' },
      take: 100
    });

    console.log(`\n📋 Total Cashbook Entries checked: ${allCashbookEntries.length}`);

    const feb2025CB = allCashbookEntries.filter(cb => {
      const date = new Date(cb.transactionDate);
      return date >= feb2025Start && date <= feb2025End;
    });

    const feb2026CB = allCashbookEntries.filter(cb => {
      const date = new Date(cb.transactionDate);
      return date >= feb2026Start && date <= feb2026End;
    });

    console.log(`📋 February 2025 Cashbook Entries: ${feb2025CB.length}`);
    if (feb2025CB.length > 0) {
      feb2025CB.forEach((cb, idx) => {
        console.log(`  ${idx + 1}. ${cb.reference || cb.id} - ${cb.transactionDate.toISOString().split('T')[0]} - ${cb.type} - $${cb.amount}`);
      });
    }

    console.log(`\n📋 February 2026 Cashbook Entries: ${feb2026CB.length}`);
    if (feb2026CB.length > 0) {
      feb2026CB.forEach((cb, idx) => {
        console.log(`  ${idx + 1}. ${cb.reference || cb.id} - ${cb.transactionDate.toISOString().split('T')[0]} - ${cb.type} - $${cb.amount}`);
      });
    }

    // Check for suspicious cashbook dates
    const suspiciousCB = allCashbookEntries.filter(cb => {
      const date = new Date(cb.transactionDate);
      return date.getMonth() + 1 === 2;
    });

    if (suspiciousCB.length > 0) {
      console.log(`\n⚠️  Found ${suspiciousCB.length} cashbook entries with February dates:`);
      suspiciousCB.slice(0, 10).forEach((cb, idx) => {
        const date = new Date(cb.transactionDate);
        console.log(`  ${idx + 1}. ${cb.reference || cb.id} - ${date.toISOString()} - $${cb.amount}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('🧾 INVOICES - Detailed Check');
    console.log('='.repeat(80));

    const allInvoices = await prisma.invoice.findMany({
      select: {
        id: true,
        invoiceNumber: true,
        transactionDate: true,
        status: true,
        totalAmount: true
      },
      orderBy: { transactionDate: 'desc' },
      take: 100
    });

    console.log(`\n📋 Total Invoices checked: ${allInvoices.length}`);

    const feb2025Inv = allInvoices.filter(inv => {
      const date = new Date(inv.transactionDate);
      return date >= feb2025Start && date <= feb2025End;
    });

    const feb2026Inv = allInvoices.filter(inv => {
      const date = new Date(inv.transactionDate);
      return date >= feb2026Start && date <= feb2026End;
    });

    console.log(`📋 February 2025 Invoices: ${feb2025Inv.length}`);
    if (feb2025Inv.length > 0) {
      feb2025Inv.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. ${inv.invoiceNumber} - ${inv.transactionDate.toISOString().split('T')[0]} - $${inv.totalAmount}`);
      });
    }

    console.log(`\n📋 February 2026 Invoices: ${feb2026Inv.length}`);
    if (feb2026Inv.length > 0) {
      feb2026Inv.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. ${inv.invoiceNumber} - ${inv.transactionDate.toISOString().split('T')[0]} - $${inv.totalAmount}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('💸 EXPENSES - Detailed Check');
    console.log('='.repeat(80));

    const allExpenses = await prisma.expense.findMany({
      select: {
        id: true,
        receiptNumber: true,
        transactionDate: true,
        status: true,
        totalAmount: true,
        description: true
      },
      orderBy: { transactionDate: 'desc' },
      take: 100
    });

    console.log(`\n📋 Total Expenses checked: ${allExpenses.length}`);

    const feb2025Exp = allExpenses.filter(exp => {
      const date = new Date(exp.transactionDate);
      return date >= feb2025Start && date <= feb2025End;
    });

    const feb2026Exp = allExpenses.filter(exp => {
      const date = new Date(exp.transactionDate);
      return date >= feb2026Start && date <= feb2026End;
    });

    console.log(`📋 February 2025 Expenses: ${feb2025Exp.length}`);
    if (feb2025Exp.length > 0) {
      feb2025Exp.forEach((exp, idx) => {
        console.log(`  ${idx + 1}. ${exp.receiptNumber || exp.id} - ${exp.transactionDate.toISOString().split('T')[0]} - $${exp.totalAmount}`);
      });
    }

    console.log(`\n📋 February 2026 Expenses: ${feb2026Exp.length}`);
    if (feb2026Exp.length > 0) {
      feb2026Exp.forEach((exp, idx) => {
        console.log(`  ${idx + 1}. ${exp.receiptNumber || exp.id} - ${exp.transactionDate.toISOString().split('T')[0]} - $${exp.totalAmount}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));

    const totalFeb2025 = feb2025JEs.length + feb2025CB.length + feb2025Inv.length + feb2025Exp.length;
    const totalFeb2026 = feb2026JEs.length + feb2026CB.length + feb2026Inv.length + feb2026Exp.length;
    const totalSuspicious = suspiciousDates.length + suspiciousCB.length;

    console.log(`\n📊 Total February 2025 Records: ${totalFeb2025}`);
    console.log(`📊 Total February 2026 Records: ${totalFeb2026}`);
    console.log(`📊 Total Suspicious February Dates (any year): ${totalSuspicious}`);

    if (totalFeb2025 > 0 || totalFeb2026 > 0 || totalSuspicious > 0) {
      console.log('\n⚠️  WARNING: Found February data!');
      console.log('   This data should not exist if we are not yet in February.');
    } else {
      console.log('\n✅ No February data found in the database.');
      console.log('   The issue is likely in how the frontend is requesting or displaying data.');
    }

    // Check date ranges of all data
    console.log('\n' + '='.repeat(80));
    console.log('📅 DATE RANGE ANALYSIS');
    console.log('='.repeat(80));

    if (allJournalEntries.length > 0) {
      const dates = allJournalEntries.map(je => new Date(je.transactionDate));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      console.log(`\n📅 Journal Entries Date Range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);
    }

    if (allCashbookEntries.length > 0) {
      const dates = allCashbookEntries.map(cb => new Date(cb.transactionDate));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
      console.log(`📅 Cashbook Entries Date Range: ${minDate.toISOString().split('T')[0]} to ${maxDate.toISOString().split('T')[0]}`);
    }

  } catch (error: any) {
    console.error('❌ Error checking February data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkFebruaryDataDetailed()
  .then(() => {
    console.log('\n✅ Detailed check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to check February data:', error);
    process.exit(1);
  });
