const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function resetInvoiceApproval() {
  try {
    const invoiceId = process.argv[2];

    if (!invoiceId) {
      console.error('❌ Please provide an invoice ID');
      console.log('Usage: node scripts/reset-invoice-approval.js <invoice-id>');
      process.exit(1);
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('🔄 RESETTING INVOICE APPROVAL STATUS');
    console.log('════════════════════════════════════════════════════════════════\n');

    console.log(`📋 Invoice ID: ${invoiceId}\n`);

    // Get current invoice status
    const invoice = await prisma.procurementInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (!invoice) {
      console.error(`❌ Invoice with ID ${invoiceId} not found`);
      process.exit(1);
    }

    console.log(`✅ Invoice Found: ${invoice.invoiceNumber}`);
    console.log(`   Vendor: ${invoice.vendor.name}`);
    console.log(`   Current Status: ${invoice.status}`);
    console.log(`   Payment Status: ${invoice.paymentStatus}`);
    console.log(`   Approved By: ${invoice.approvedById || 'N/A'}`);
    console.log(`   Approved At: ${invoice.approvedAt || 'N/A'}`);

    // Reset invoice to DRAFT status (before approval)
    console.log('\n🔄 Resetting invoice to DRAFT status...');
    const updatedInvoice = await prisma.procurementInvoice.update({
      where: { id: invoiceId },
      data: {
        status: 'DRAFT',
        approvedById: null,
        approvedAt: null,
        paymentStatus: 'PENDING'
      },
      include: {
        vendor: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    console.log('✅ Invoice reset successfully!');
    console.log(`\n📊 Updated Status:`);
    console.log(`   • Status: ${updatedInvoice.status}`);
    console.log(`   • Payment Status: ${updatedInvoice.paymentStatus}`);
    console.log(`   • Approved By: ${updatedInvoice.approvedById || 'null'}`);
    console.log(`   • Approved At: ${updatedInvoice.approvedAt || 'null'}`);

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ RESET COMPLETE!');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('\n📌 Invoice is now ready for approval with taxable status selection.\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetInvoiceApproval()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

