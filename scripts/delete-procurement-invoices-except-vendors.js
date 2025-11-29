const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function deleteProcurementInvoices() {
  try {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('🗑️  DELETING PROCUREMENT INVOICES (EXCEPT SPECIFIED VENDORS)');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Vendor emails to keep
    const vendorEmailsToKeep = [
      'veximagames@gmail.com',
      'logixvine@gmail.com'
    ];

    console.log('📋 Step 1: Finding vendors to keep...');
    const vendorsToKeep = await prisma.vendor.findMany({
      where: {
        email: {
          in: vendorEmailsToKeep
        }
      },
      select: {
        id: true,
        name: true,
        email: true
      }
    });

    console.log(`✅ Found ${vendorsToKeep.length} vendor(s) to keep:`);
    vendorsToKeep.forEach(v => {
      console.log(`   • ${v.name} (${v.email}) - ID: ${v.id}`);
    });

    if (vendorsToKeep.length === 0) {
      console.log('\n⚠️  WARNING: No vendors found with the specified emails!');
      console.log('   Proceeding to delete ALL procurement invoices...');
    }

    const vendorIdsToKeep = vendorsToKeep.map(v => v.id);

    console.log('\n📊 Step 2: Counting invoices...');
    const totalInvoices = await prisma.procurementInvoice.count();
    console.log(`   Total invoices: ${totalInvoices}`);

    const invoicesToKeep = vendorIdsToKeep.length > 0
      ? await prisma.procurementInvoice.count({
          where: {
            vendorId: {
              in: vendorIdsToKeep
            }
          }
        })
      : 0;

    const invoicesToDelete = totalInvoices - invoicesToKeep;
    console.log(`   Invoices to keep: ${invoicesToKeep}`);
    console.log(`   Invoices to delete: ${invoicesToDelete}`);

    if (invoicesToDelete === 0) {
      console.log('\n✅ No invoices to delete. All invoices belong to the specified vendors.');
      return;
    }

    // First, nullify journalEntryId references to avoid foreign key constraints
    console.log('\n🔧 Step 3: Nullifying journal entry references...');
    const invoicesWithJournalEntries = await prisma.procurementInvoice.findMany({
      where: {
        journalEntryId: { not: null },
        ...(vendorIdsToKeep.length > 0 && {
          vendorId: { notIn: vendorIdsToKeep }
        })
      },
      select: {
        id: true,
        invoiceNumber: true,
        journalEntryId: true
      }
    });

    if (invoicesWithJournalEntries.length > 0) {
      console.log(`   Found ${invoicesWithJournalEntries.length} invoice(s) with journal entries`);
      for (const invoice of invoicesWithJournalEntries) {
        await prisma.procurementInvoice.update({
          where: { id: invoice.id },
          data: { journalEntryId: null }
        });
        console.log(`   ✅ Nullified journal entry for ${invoice.invoiceNumber}`);
      }
    } else {
      console.log('   ✅ No invoices with journal entries to nullify');
    }

    // Also nullify quotationId references in VendorQuotation if needed
    console.log('\n🔧 Step 4: Nullifying quotation references...');
    const invoicesWithQuotations = await prisma.procurementInvoice.findMany({
      where: {
        quotationId: { not: null },
        ...(vendorIdsToKeep.length > 0 && {
          vendorId: { notIn: vendorIdsToKeep }
        })
      },
      select: {
        id: true,
        invoiceNumber: true,
        quotationId: true
      }
    });

    if (invoicesWithQuotations.length > 0) {
      console.log(`   Found ${invoicesWithQuotations.length} invoice(s) with quotations`);
      // Update VendorQuotation to nullify invoiceId reference
      for (const invoice of invoicesWithQuotations) {
        if (invoice.quotationId) {
          await prisma.vendorQuotation.updateMany({
            where: { invoiceId: invoice.id },
            data: { invoiceId: null }
          });
          console.log(`   ✅ Nullified quotation reference for ${invoice.invoiceNumber}`);
        }
      }
    } else {
      console.log('   ✅ No invoices with quotations to nullify');
    }

    // Now delete the invoices
    console.log('\n🗑️  Step 5: Deleting invoices...');
    const deleteResult = await prisma.procurementInvoice.deleteMany({
      where: {
        ...(vendorIdsToKeep.length > 0 && {
          vendorId: { notIn: vendorIdsToKeep }
        })
      }
    });

    console.log(`✅ Successfully deleted ${deleteResult.count} invoice(s)`);

    // Verify final count
    const remainingCount = await prisma.procurementInvoice.count();
    console.log(`\n📊 Remaining invoices: ${remainingCount}`);

    if (vendorIdsToKeep.length > 0 && remainingCount > 0) {
      console.log('\n📋 Remaining invoices by vendor:');
      const remainingInvoices = await prisma.procurementInvoice.findMany({
        include: {
          vendor: {
            select: {
              name: true,
              email: true
            }
          }
        }
      });

      const groupedByVendor = {};
      remainingInvoices.forEach(inv => {
        const vendorKey = `${inv.vendor.name} (${inv.vendor.email || 'no email'})`;
        if (!groupedByVendor[vendorKey]) {
          groupedByVendor[vendorKey] = [];
        }
        groupedByVendor[vendorKey].push(inv.invoiceNumber);
      });

      Object.entries(groupedByVendor).forEach(([vendor, invoices]) => {
        console.log(`   • ${vendor}: ${invoices.length} invoice(s)`);
      });
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ DELETION COMPLETE!');
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteProcurementInvoices()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

