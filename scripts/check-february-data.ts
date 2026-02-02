import { prisma } from '../src/utils/database';

async function checkFebruaryData() {
  console.log('🔍 Checking for February data in accounting module...\n');

  try {
    // Get current date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12
    console.log(`📅 Current Date: ${now.toISOString().split('T')[0]}`);
    console.log(`📅 Current Year: ${currentYear}, Month: ${currentMonth}\n`);

    // Check for February 2025 data
    const feb2025Start = new Date('2025-02-01');
    const feb2025End = new Date('2025-02-28T23:59:59.999Z');
    
    // Check for February 2026 data
    const feb2026Start = new Date('2026-02-01');
    const feb2026End = new Date('2026-02-28T23:59:59.999Z');

    console.log('='.repeat(80));
    console.log('📊 JOURNAL ENTRIES');
    console.log('='.repeat(80));

    // Check journal entries
    const journalEntries2025 = await prisma.journalEntry.findMany({
      where: {
        transactionDate: {
          gte: feb2025Start,
          lte: feb2025End
        }
      },
      select: {
        id: true,
        referenceNumber: true,
        transactionDate: true,
        status: true,
        description: true
      },
      orderBy: { transactionDate: 'asc' }
    });

    const journalEntries2026 = await prisma.journalEntry.findMany({
      where: {
        transactionDate: {
          gte: feb2026Start,
          lte: feb2026End
        }
      },
      select: {
        id: true,
        referenceNumber: true,
        transactionDate: true,
        status: true,
        description: true
      },
      orderBy: { transactionDate: 'asc' }
    });

    console.log(`\n📋 February 2025 Journal Entries: ${journalEntries2025.length}`);
    if (journalEntries2025.length > 0) {
      journalEntries2025.forEach((je, idx) => {
        console.log(`  ${idx + 1}. ${je.referenceNumber} - ${je.transactionDate.toISOString().split('T')[0]} - ${je.status} - ${je.description?.substring(0, 50) || 'N/A'}`);
      });
    }

    console.log(`\n📋 February 2026 Journal Entries: ${journalEntries2026.length}`);
    if (journalEntries2026.length > 0) {
      journalEntries2026.forEach((je, idx) => {
        console.log(`  ${idx + 1}. ${je.referenceNumber} - ${je.transactionDate.toISOString().split('T')[0]} - ${je.status} - ${je.description?.substring(0, 50) || 'N/A'}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('💰 CASHBOOK ENTRIES');
    console.log('='.repeat(80));

    // Check cashbook entries
    const cashbookEntries2025 = await prisma.cashbookEntry.findMany({
      where: {
        transactionDate: {
          gte: feb2025Start,
          lte: feb2025End
        }
      },
      select: {
        id: true,
        reference: true,
        transactionDate: true,
        status: true,
        type: true,
        amount: true,
        description: true
      },
      orderBy: { transactionDate: 'asc' }
    });

    const cashbookEntries2026 = await prisma.cashbookEntry.findMany({
      where: {
        transactionDate: {
          gte: feb2026Start,
          lte: feb2026End
        }
      },
      select: {
        id: true,
        reference: true,
        transactionDate: true,
        status: true,
        type: true,
        amount: true,
        description: true
      },
      orderBy: { transactionDate: 'asc' }
    });

    console.log(`\n📋 February 2025 Cashbook Entries: ${cashbookEntries2025.length}`);
    if (cashbookEntries2025.length > 0) {
      cashbookEntries2025.forEach((cb, idx) => {
        console.log(`  ${idx + 1}. ${cb.reference || cb.id} - ${cb.transactionDate.toISOString().split('T')[0]} - ${cb.type} - ${cb.status} - $${cb.amount} - ${cb.description?.substring(0, 40) || 'N/A'}`);
      });
    }

    console.log(`\n📋 February 2026 Cashbook Entries: ${cashbookEntries2026.length}`);
    if (cashbookEntries2026.length > 0) {
      cashbookEntries2026.forEach((cb, idx) => {
        console.log(`  ${idx + 1}. ${cb.reference || cb.id} - ${cb.transactionDate.toISOString().split('T')[0]} - ${cb.type} - ${cb.status} - $${cb.amount} - ${cb.description?.substring(0, 40) || 'N/A'}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('🧾 INVOICES');
    console.log('='.repeat(80));

    // Check invoices
    const invoices2025 = await prisma.invoice.findMany({
      where: {
        transactionDate: {
          gte: feb2025Start,
          lte: feb2025End
        }
      },
      select: {
        id: true,
        invoiceNumber: true,
        transactionDate: true,
        status: true,
        totalAmount: true
      },
      orderBy: { transactionDate: 'asc' }
    });

    const invoices2026 = await prisma.invoice.findMany({
      where: {
        transactionDate: {
          gte: feb2026Start,
          lte: feb2026End
        }
      },
      select: {
        id: true,
        invoiceNumber: true,
        transactionDate: true,
        status: true,
        totalAmount: true
      },
      orderBy: { transactionDate: 'asc' }
    });

    console.log(`\n📋 February 2025 Invoices: ${invoices2025.length}`);
    if (invoices2025.length > 0) {
      invoices2025.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. ${inv.invoiceNumber} - ${inv.transactionDate.toISOString().split('T')[0]} - ${inv.status} - $${inv.totalAmount}`);
      });
    }

    console.log(`\n📋 February 2026 Invoices: ${invoices2026.length}`);
    if (invoices2026.length > 0) {
      invoices2026.forEach((inv, idx) => {
        console.log(`  ${idx + 1}. ${inv.invoiceNumber} - ${inv.transactionDate.toISOString().split('T')[0]} - ${inv.status} - $${inv.totalAmount}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('💸 EXPENSES');
    console.log('='.repeat(80));

    // Check expenses
    const expenses2025 = await prisma.expense.findMany({
      where: {
        transactionDate: {
          gte: feb2025Start,
          lte: feb2025End
        }
      },
      select: {
        id: true,
        receiptNumber: true,
        transactionDate: true,
        status: true,
        totalAmount: true,
        description: true
      },
      orderBy: { transactionDate: 'asc' }
    });

    const expenses2026 = await prisma.expense.findMany({
      where: {
        transactionDate: {
          gte: feb2026Start,
          lte: feb2026End
        }
      },
      select: {
        id: true,
        receiptNumber: true,
        transactionDate: true,
        status: true,
        totalAmount: true,
        description: true
      },
      orderBy: { transactionDate: 'asc' }
    });

    console.log(`\n📋 February 2025 Expenses: ${expenses2025.length}`);
    if (expenses2025.length > 0) {
      expenses2025.forEach((exp, idx) => {
        console.log(`  ${idx + 1}. ${exp.receiptNumber || exp.id} - ${exp.transactionDate.toISOString().split('T')[0]} - ${exp.status} - $${exp.totalAmount} - ${exp.description?.substring(0, 40) || 'N/A'}`);
      });
    }

    console.log(`\n📋 February 2026 Expenses: ${expenses2026.length}`);
    if (expenses2026.length > 0) {
      expenses2026.forEach((exp, idx) => {
        console.log(`  ${idx + 1}. ${exp.receiptNumber || exp.id} - ${exp.transactionDate.toISOString().split('T')[0]} - ${exp.status} - $${exp.totalAmount} - ${exp.description?.substring(0, 40) || 'N/A'}`);
      });
    }

    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));

    const totalFeb2025 = journalEntries2025.length + cashbookEntries2025.length + invoices2025.length + expenses2025.length;
    const totalFeb2026 = journalEntries2026.length + cashbookEntries2026.length + invoices2026.length + expenses2026.length;

    console.log(`\n📊 Total February 2025 Records: ${totalFeb2025}`);
    console.log(`📊 Total February 2026 Records: ${totalFeb2026}`);

    if (totalFeb2025 > 0 || totalFeb2026 > 0) {
      console.log('\n⚠️  WARNING: Found February data!');
      if (currentMonth < 2) {
        console.log('   This data should not exist if we are not yet in February.');
        console.log('   This could be test data or incorrectly dated transactions.');
      }
    } else {
      console.log('\n✅ No February data found in the database.');
    }

  } catch (error: any) {
    console.error('❌ Error checking February data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkFebruaryData()
  .then(() => {
    console.log('\n✅ Check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to check February data:', error);
    process.exit(1);
  });
