const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRemainingTraces() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 CHECKING FOR REMAINING ACCOUNTING TRACES');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Check invoices
    const paidInvoices = await prisma.invoice.findMany({
      where: {
        OR: [
          { status: 'PAID' },
          { status: 'PARTIALLY_PAID' },
          { paidAmount: { gt: 0 } }
        ]
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        paidAmount: true
      }
    });

    console.log(`📄 Invoices:`);
    console.log(`   Paid/Partially Paid: ${paidInvoices.length}`);
    if (paidInvoices.length > 0) {
      paidInvoices.forEach(inv => {
        console.log(`   ⚠️  ${inv.invoiceNumber || inv.id} - Status: ${inv.status}, Paid: ${inv.paidAmount}`);
      });
    }
    console.log('');

    // Check cashbook entries
    const cashbookEntries = await prisma.cashbookEntry.findMany({
      select: { id: true }
    });
    console.log(`📝 Cashbook Entries: ${cashbookEntries.length}`);
    if (cashbookEntries.length > 0) {
      console.log(`   ⚠️  ${cashbookEntries.length} cashbook entry(ies) still exist`);
    }
    console.log('');

    // Check journal entries
    const journalEntries = await prisma.journalEntry.findMany({
      select: { id: true }
    });
    console.log(`📋 Journal Entries: ${journalEntries.length}`);
    if (journalEntries.length > 0) {
      console.log(`   ⚠️  ${journalEntries.length} journal entry(ies) still exist`);
    }
    console.log('');

    // Check fund disbursements
    const disbursements = await prisma.fundDisbursement.findMany({
      select: { id: true, status: true }
    });
    console.log(`💰 Fund Disbursements: ${disbursements.length}`);
    if (disbursements.length > 0) {
      console.log(`   ⚠️  ${disbursements.length} fund disbursement(s) still exist`);
    }
    console.log('');

    // Check investment implementations with disbursements
    const implementations = await prisma.investmentImplementation.findMany({
      where: { fundsDisbursed: true },
      select: { id: true }
    });
    console.log(`📊 Investment Implementations (disbursed): ${implementations.length}`);
    if (implementations.length > 0) {
      console.log(`   ⚠️  ${implementations.length} implementation(s) still marked as disbursed`);
    }
    console.log('');

    // Check assets with monetary values
    const assets = await prisma.asset.findMany({
      where: {
        OR: [
          { cost: { gt: 0 } },
          { currentBookValue: { gt: 0 } }
        ]
      },
      select: {
        id: true,
        assetName: true,
        cost: true,
        currentBookValue: true
      }
    });
    console.log(`🏢 Assets with monetary values: ${assets.length}`);
    if (assets.length > 0) {
      assets.forEach(asset => {
        console.log(`   ⚠️  ${asset.assetName || asset.id} - Cost: ${asset.cost}, Book Value: ${asset.currentBookValue}`);
      });
    }
    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    const totalIssues = paidInvoices.length + cashbookEntries.length + journalEntries.length + 
                       disbursements.length + implementations.length + assets.length;

    if (totalIssues === 0) {
      console.log('✅ No accounting traces found! System is clean.');
    } else {
      console.log(`⚠️  Found ${totalIssues} potential accounting trace(s):`);
      if (paidInvoices.length > 0) console.log(`   - ${paidInvoices.length} invoice(s) with paid status`);
      if (cashbookEntries.length > 0) console.log(`   - ${cashbookEntries.length} cashbook entry(ies)`);
      if (journalEntries.length > 0) console.log(`   - ${journalEntries.length} journal entry(ies)`);
      if (disbursements.length > 0) console.log(`   - ${disbursements.length} fund disbursement(s)`);
      if (implementations.length > 0) console.log(`   - ${implementations.length} investment implementation(s) marked as disbursed`);
      if (assets.length > 0) console.log(`   - ${assets.length} asset(s) with monetary values`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkRemainingTraces()
  .then(() => {
    console.log('\n✅ Check completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Check failed:', error);
    process.exit(1);
  });

