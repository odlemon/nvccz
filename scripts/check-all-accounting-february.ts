import { prisma } from '../src/utils/database';

async function checkAllAccountingFebruary() {
  console.log('🔍 Comprehensive check for February data in ALL accounting entities...\n');

  try {
    const now = new Date();
    console.log(`📅 Current Date: ${now.toISOString()}`);
    console.log(`📅 Current Year: ${now.getFullYear()}, Month: ${now.getMonth() + 1}, Day: ${now.getDate()}\n`);

    // February date ranges
    const feb2025Start = new Date('2025-02-01T00:00:00.000Z');
    const feb2025End = new Date('2025-02-28T23:59:59.999Z');
    const feb2026Start = new Date('2026-02-01T00:00:00.000Z');
    const feb2026End = new Date('2026-02-28T23:59:59.999Z');

    let totalFeb2025 = 0;
    let totalFeb2026 = 0;

    console.log('='.repeat(80));
    console.log('📊 JOURNAL ENTRIES');
    console.log('='.repeat(80));

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
      }
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
      }
    });

    console.log(`📋 February 2025: ${journalEntries2025.length}`);
    console.log(`📋 February 2026: ${journalEntries2026.length}`);
    if (journalEntries2025.length > 0 || journalEntries2026.length > 0) {
      [...journalEntries2025, ...journalEntries2026].forEach((je, idx) => {
        console.log(`  ${idx + 1}. ${je.referenceNumber} - ${je.transactionDate.toISOString().split('T')[0]} - ${je.status}`);
      });
    }
    totalFeb2025 += journalEntries2025.length;
    totalFeb2026 += journalEntries2026.length;

    console.log('\n' + '='.repeat(80));
    console.log('💰 CASHBOOK ENTRIES');
    console.log('='.repeat(80));

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
        amount: true
      }
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
        amount: true
      }
    });

    console.log(`📋 February 2025: ${cashbookEntries2025.length}`);
    console.log(`📋 February 2026: ${cashbookEntries2026.length}`);
    if (cashbookEntries2025.length > 0 || cashbookEntries2026.length > 0) {
      [...cashbookEntries2025, ...cashbookEntries2026].forEach((cb, idx) => {
        console.log(`  ${idx + 1}. ${cb.reference || cb.id} - ${cb.transactionDate.toISOString().split('T')[0]} - ${cb.type} - $${cb.amount}`);
      });
    }
    totalFeb2025 += cashbookEntries2025.length;
    totalFeb2026 += cashbookEntries2026.length;

    console.log('\n' + '='.repeat(80));
    console.log('🧾 INVOICES');
    console.log('='.repeat(80));

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
      }
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
      }
    });

    console.log(`📋 February 2025: ${invoices2025.length}`);
    console.log(`📋 February 2026: ${invoices2026.length}`);
    if (invoices2025.length > 0 || invoices2026.length > 0) {
      [...invoices2025, ...invoices2026].forEach((inv, idx) => {
        console.log(`  ${idx + 1}. ${inv.invoiceNumber} - ${inv.transactionDate.toISOString().split('T')[0]} - $${inv.totalAmount}`);
      });
    }
    totalFeb2025 += invoices2025.length;
    totalFeb2026 += invoices2026.length;

    console.log('\n' + '='.repeat(80));
    console.log('💸 EXPENSES');
    console.log('='.repeat(80));

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
        totalAmount: true
      }
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
        totalAmount: true
      }
    });

    console.log(`📋 February 2025: ${expenses2025.length}`);
    console.log(`📋 February 2026: ${expenses2026.length}`);
    if (expenses2025.length > 0 || expenses2026.length > 0) {
      [...expenses2025, ...expenses2026].forEach((exp, idx) => {
        console.log(`  ${idx + 1}. ${exp.receiptNumber || exp.id} - ${exp.transactionDate.toISOString().split('T')[0]} - $${exp.totalAmount}`);
      });
    }
    totalFeb2025 += expenses2025.length;
    totalFeb2026 += expenses2026.length;

    console.log('\n' + '='.repeat(80));
    console.log('📝 CREDIT NOTES');
    console.log('='.repeat(80));

    const creditNotes2025 = await prisma.creditNote.findMany({
      where: {
        createdAt: {
          gte: feb2025Start,
          lte: feb2025End
        }
      },
      select: {
        id: true,
        creditNoteNumber: true,
        createdAt: true,
        status: true,
        totalAmount: true
      }
    });

    const creditNotes2026 = await prisma.creditNote.findMany({
      where: {
        createdAt: {
          gte: feb2026Start,
          lte: feb2026End
        }
      },
      select: {
        id: true,
        creditNoteNumber: true,
        createdAt: true,
        status: true,
        totalAmount: true
      }
    });

    console.log(`📋 February 2025: ${creditNotes2025.length}`);
    console.log(`📋 February 2026: ${creditNotes2026.length}`);
    if (creditNotes2025.length > 0 || creditNotes2026.length > 0) {
      [...creditNotes2025, ...creditNotes2026].forEach((cn, idx) => {
        console.log(`  ${idx + 1}. ${cn.creditNoteNumber} - ${cn.createdAt.toISOString().split('T')[0]} - $${cn.totalAmount}`);
      });
    }
    totalFeb2025 += creditNotes2025.length;
    totalFeb2026 += creditNotes2026.length;

    console.log('\n' + '='.repeat(80));
    console.log('🛒 PURCHASE INVOICES');
    console.log('='.repeat(80));

    const purchaseInvoices2025 = await prisma.purchaseInvoice.findMany({
      where: {
        invoiceDate: {
          gte: feb2025Start,
          lte: feb2025End
        }
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        status: true,
        totalAmount: true
      }
    });

    const purchaseInvoices2026 = await prisma.purchaseInvoice.findMany({
      where: {
        invoiceDate: {
          gte: feb2026Start,
          lte: feb2026End
        }
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        status: true,
        totalAmount: true
      }
    });

    console.log(`📋 February 2025: ${purchaseInvoices2025.length}`);
    console.log(`📋 February 2026: ${purchaseInvoices2026.length}`);
    if (purchaseInvoices2025.length > 0 || purchaseInvoices2026.length > 0) {
      [...purchaseInvoices2025, ...purchaseInvoices2026].forEach((pi, idx) => {
        console.log(`  ${idx + 1}. ${pi.invoiceNumber} - ${pi.invoiceDate.toISOString().split('T')[0]} - $${pi.totalAmount}`);
      });
    }
    totalFeb2025 += purchaseInvoices2025.length;
    totalFeb2026 += purchaseInvoices2026.length;

    console.log('\n' + '='.repeat(80));
    console.log('📋 PURCHASE INVOICES (dueDate check)');
    console.log('='.repeat(80));

    const purchaseInvoicesDue2025 = await prisma.purchaseInvoice.findMany({
      where: {
        dueDate: {
          gte: feb2025Start,
          lte: feb2025End
        }
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        status: true,
        totalAmount: true
      }
    });

    const purchaseInvoicesDue2026 = await prisma.purchaseInvoice.findMany({
      where: {
        dueDate: {
          gte: feb2026Start,
          lte: feb2026End
        }
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        dueDate: true,
        status: true,
        totalAmount: true
      }
    });

    console.log(`📋 February 2025 (dueDate): ${purchaseInvoicesDue2025.length}`);
    console.log(`📋 February 2026 (dueDate): ${purchaseInvoicesDue2026.length}`);
    if (purchaseInvoicesDue2025.length > 0 || purchaseInvoicesDue2026.length > 0) {
      [...purchaseInvoicesDue2025, ...purchaseInvoicesDue2026].forEach((pi, idx) => {
        console.log(`  ${idx + 1}. ${pi.invoiceNumber} - Invoice: ${pi.invoiceDate.toISOString().split('T')[0]}, Due: ${pi.dueDate?.toISOString().split('T')[0]} - $${pi.totalAmount}`);
      });
    }

    // Note: Payment model might not exist, skipping for now
    // Payments are typically handled through cashbook entries

    console.log('\n' + '='.repeat(80));
    console.log('📊 SUMMARY');
    console.log('='.repeat(80));

    console.log(`\n📊 Total February 2025 Records: ${totalFeb2025}`);
    console.log(`📊 Total February 2026 Records: ${totalFeb2026}`);
    console.log(`📊 Total February Records (all): ${totalFeb2025 + totalFeb2026}`);

    if (totalFeb2025 > 0 || totalFeb2026 > 0) {
      console.log('\n⚠️  WARNING: Found February data!');
      console.log('   This data should not exist if we are not yet in February.');
    } else {
      console.log('\n✅ No February data found in ANY accounting entities.');
      console.log('   The issue is definitely in how the frontend is requesting or displaying data.');
      console.log('   Check the graph/chart component to see what API calls it\'s making.');
    }

    // Check for any data with February in dates (broader check)
    console.log('\n' + '='.repeat(80));
    console.log('🔍 BROADER CHECK: Any transaction with month = 2');
    console.log('='.repeat(80));

    // Get sample of all transactions to check their months
    const sampleJE = await prisma.journalEntry.findMany({
      select: { transactionDate: true },
      take: 50
    });

    const sampleCB = await prisma.cashbookEntry.findMany({
      select: { transactionDate: true },
      take: 50
    });

    const sampleInv = await prisma.invoice.findMany({
      select: { transactionDate: true },
      take: 50
    });

    const allDates = [
      ...sampleJE.map(je => new Date(je.transactionDate)),
      ...sampleCB.map(cb => new Date(cb.transactionDate)),
      ...sampleInv.map(inv => new Date(inv.transactionDate))
    ];

    const febDates = allDates.filter(date => date.getMonth() === 1); // Month 1 = February (0-indexed)

    console.log(`📋 Total sample dates checked: ${allDates.length}`);
    console.log(`📋 Dates in February (any year): ${febDates.length}`);
    if (febDates.length > 0) {
      console.log('⚠️  Found dates in February:');
      febDates.slice(0, 10).forEach((date, idx) => {
        console.log(`  ${idx + 1}. ${date.toISOString()} (${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')})`);
      });
    }

  } catch (error: any) {
    console.error('❌ Error checking February data:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkAllAccountingFebruary()
  .then(() => {
    console.log('\n✅ Comprehensive check complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Failed to check February data:', error);
    process.exit(1);
  });
