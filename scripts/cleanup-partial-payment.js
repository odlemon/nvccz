const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupPartialPayment() {
  try {
    const invoiceId = process.argv[2];

    if (!invoiceId) {
      console.error('❌ Please provide an invoice ID');
      console.log('Usage: node scripts/cleanup-partial-payment.js <invoice-id>');
      process.exit(1);
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('🧹 CLEANING UP PARTIAL PAYMENT');
    console.log('════════════════════════════════════════════════════════════════\n');

    console.log(`📋 Invoice ID: ${invoiceId}\n`);

    // Get invoice
    const invoice = await prisma.procurementInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        journalEntry: {
          include: {
            journalEntryLines: true
          }
        }
      }
    });

    if (!invoice) {
      console.error(`❌ Invoice with ID ${invoiceId} not found`);
      process.exit(1);
    }

    console.log(`✅ Invoice Found: ${invoice.invoiceNumber}`);
    console.log(`   Status: ${invoice.status}`);
    console.log(`   Payment Status: ${invoice.paymentStatus}`);
    console.log(`   Journal Entry ID: ${invoice.journalEntryId || 'None'}`);

    // Find all journal entries related to this invoice
    console.log('\n🔍 Searching for related journal entries...');
    const allEntries = await prisma.journalEntry.findMany({
      where: {
        OR: [
          { id: invoice.journalEntryId || 'none' },
          { referenceNumber: { contains: invoice.invoiceNumber } },
          { description: { contains: invoice.invoiceNumber } }
        ]
      },
      include: {
        journalEntryLines: true
      }
    });

    console.log(`   Found ${allEntries.length} related journal entries\n`);

    if (allEntries.length === 0) {
      console.log('✅ No journal entries to clean up');
      return;
    }

    // Delete journal entry lines first (foreign key constraint)
    for (const entry of allEntries) {
      console.log(`\n🗑️  Deleting journal entry: ${entry.referenceNumber}`);
      console.log(`   Lines: ${entry.journalEntryLines.length}`);
      
      // Delete lines
      for (const line of entry.journalEntryLines) {
        await prisma.journalEntryLine.delete({
          where: { id: line.id }
        });
      }
      console.log(`   ✅ Deleted ${entry.journalEntryLines.length} lines`);

      // Delete entry
      await prisma.journalEntry.delete({
        where: { id: entry.id }
      });
      console.log(`   ✅ Deleted journal entry`);
    }

    // Reset invoice payment status
    console.log('\n🔄 Resetting invoice payment status...');
    const updatedInvoice = await prisma.procurementInvoice.update({
      where: { id: invoiceId },
      data: {
        paymentStatus: 'PENDING',
        paymentDate: null,
        paymentReference: null,
        journalEntryId: null
      }
    });

    console.log('✅ Invoice reset to PENDING');
    console.log(`\n📊 Updated Invoice:`);
    console.log(`   • Payment Status: ${updatedInvoice.paymentStatus}`);
    console.log(`   • Payment Date: ${updatedInvoice.paymentDate || 'null'}`);
    console.log(`   • Journal Entry ID: ${updatedInvoice.journalEntryId || 'null'}`);

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ CLEANUP COMPLETE!');
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanupPartialPayment()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

