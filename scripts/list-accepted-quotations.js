const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listAcceptedQuotations() {
  try {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('📋 LISTING ACCEPTED QUOTATIONS');
    console.log('════════════════════════════════════════════════════════════════\n');

    const acceptedQuotations = await prisma.vendorQuotation.findMany({
      where: {
        status: 'ACCEPTED'
      },
      include: {
        items: true
      },
      orderBy: {
        reviewedAt: 'desc'
      }
    });

    if (acceptedQuotations.length === 0) {
      console.log('❌ No accepted quotations found.');
      console.log('\n📊 All quotations status:');
      const allQuotations = await prisma.vendorQuotation.groupBy({
        by: ['status'],
        _count: {
          id: true
        }
      });
      allQuotations.forEach(q => {
        console.log(`   • ${q.status}: ${q._count.id} quotation(s)`);
      });
      return;
    }

    console.log(`✅ Found ${acceptedQuotations.length} accepted quotation(s):\n`);

    for (let index = 0; index < acceptedQuotations.length; index++) {
      const quote = acceptedQuotations[index];
      console.log(`\n${'─'.repeat(80)}`);
      console.log(`📄 QUOTATION #${index + 1}`);
      console.log(`${'─'.repeat(80)}`);
      console.log(`ID: ${quote.id}`);
      console.log(`Quotation Number: ${quote.quotationNumber}`);
      console.log(`RFQ Number: ${quote.rfqNumber || 'N/A'}`);
      console.log(`Vendor Name: ${quote.vendorName}`);
      console.log(`Vendor Email: ${quote.vendorEmail}`);
      console.log(`Company: ${quote.companyName || 'N/A'}`);
      console.log(`Status: ${quote.status}`);
      console.log(`Total Amount: ${quote.currencyCode} ${Number(quote.totalAmount).toFixed(2)}`);
      console.log(`Subtotal: ${quote.currencyCode} ${Number(quote.subtotal).toFixed(2)}`);
      console.log(`Tax: ${quote.currencyCode} ${Number(quote.taxAmount).toFixed(2)}`);
      console.log(`Reviewed At: ${quote.reviewedAt || 'N/A'}`);
      console.log(`\n📦 Items (${quote.items.length}):`);
      quote.items.forEach((item, i) => {
        console.log(`   ${i + 1}. ${item.itemName}`);
        console.log(`      Quantity: ${Number(item.quantity)} ${item.unit || ''}`);
        console.log(`      Unit Price: ${quote.currencyCode} ${Number(item.unitPrice).toFixed(2)}`);
        console.log(`      Total: ${quote.currencyCode} ${Number(item.totalPrice).toFixed(2)}`);
      });

      // Get vendor and currency info
      const vendor = await prisma.vendor.findFirst({
        where: { email: quote.vendorEmail },
        select: { id: true, name: true, email: true }
      });

      // Find currency by code
      const currency = await prisma.currency.findFirst({
        where: { code: quote.currencyCode },
        select: { id: true, code: true, name: true }
      });

      // Generate request body example
      console.log(`\n📝 REQUEST BODY EXAMPLE for POST /api/procurement/invoices:`);
      const requestBody = {
        vendorId: vendor?.id || '⚠️ VENDOR_ID_NOT_FOUND',
        invoiceDate: new Date().toISOString(),
        dueDate: quote.validUntil ? new Date(quote.validUntil).toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ...(currency?.id && { currencyId: currency.id }),
        items: quote.items.map(item => ({
          itemName: item.itemName,
          description: item.description || '',
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          ...(item.unit && { unit: item.unit })
        }))
      };
      console.log(JSON.stringify(requestBody, null, 2));
      
      console.log(`\n📌 IMPORTANT INFO:`);
      console.log(`   • Vendor ID: ${vendor?.id || 'NOT FOUND - CREATE VENDOR FIRST'}`);
      console.log(`   • Currency ID: ${currency?.id || 'NOT FOUND - CREATE CURRENCY FIRST'}`);
      console.log(`   • Quotation ID: ${quote.id} (Note: quotationId is not accepted in create endpoint)`);
      console.log(`   • RFQ Number: ${quote.rfqNumber}`);
    }

    // Also check for vendors
    console.log(`\n\n${'═'.repeat(80)}`);
    console.log('🔍 VENDOR INFORMATION:');
    console.log(`${'═'.repeat(80)}\n`);

    const vendorEmails = [...new Set(acceptedQuotations.map(q => q.vendorEmail))];
    for (const email of vendorEmails) {
      const vendor = await prisma.vendor.findFirst({
        where: {
          email: email
        },
        select: {
          id: true,
          name: true,
          email: true
        }
      });

      if (vendor) {
        console.log(`✅ Vendor: ${vendor.name}`);
        console.log(`   Email: ${vendor.email}`);
        console.log(`   Vendor ID: ${vendor.id}`);
      } else {
        console.log(`⚠️  Vendor with email ${email} not found in Vendor table`);
        console.log(`   You may need to create a Vendor record first`);
      }
      console.log('');
    }

    console.log(`${'═'.repeat(80)}`);
    console.log('✅ LISTING COMPLETE!');
    console.log(`${'═'.repeat(80)}\n`);

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

listAcceptedQuotations()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

