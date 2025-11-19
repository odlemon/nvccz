const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixDisbursementDescriptions() {
  try {
    console.log('🔧 Fixing cashbook entry descriptions for fund disbursements...\n');

    // Find all cashbook entries created from fund disbursements
    const cashbookEntries = await prisma.cashbookEntry.findMany({
      where: {
        OR: [
          { reference: { startsWith: 'FD-' } },
          { description: { contains: 'Fund Disbursement' } }
        ]
      },
      include: {
        journalEntry: true,
        fundDisbursement: {
          include: {
            investmentImplementation: {
              include: {
                portfolioCompany: {
                  select: {
                    name: true
                  }
                }
              }
            }
          }
        }
      }
    });

    console.log(`Found ${cashbookEntries.length} cashbook entries from fund disbursements.\n`);

    let updated = 0;

    for (const entry of cashbookEntries) {
      const companyName = entry.fundDisbursement?.investmentImplementation?.portfolioCompany?.name || 'Portfolio Company';
      const amount = Number(entry.amount).toLocaleString();
      
      // Update cashbook entry description if needed
      const newCashbookDescription = `Fund Disbursement - ${companyName} - $${amount}`;
      let cashbookUpdated = false;

      if (entry.description !== newCashbookDescription) {
        await prisma.cashbookEntry.update({
          where: { id: entry.id },
          data: {
            description: newCashbookDescription
          }
        });
        cashbookUpdated = true;
      }

      // Update journal entry description to use "Bank" instead of "Cashbook PAYMENT"
      if (entry.journalEntry) {
        const newJournalDescription = `Bank Payment: Fund Disbursement - ${companyName} - $${amount}`;
        
        if (entry.journalEntry.description !== newJournalDescription) {
          await prisma.journalEntry.update({
            where: { id: entry.journalEntry.id },
            data: {
              description: newJournalDescription
            }
          });

          console.log(`✅ Updated Journal Entry: ${entry.journalEntry.referenceNumber}`);
          console.log(`   Old: ${entry.journalEntry.description}`);
          console.log(`   New: ${newJournalDescription}\n`);
          updated++;
        }
      }

      if (cashbookUpdated) {
        console.log(`✅ Updated Cashbook Entry: ${entry.reference || entry.id.substring(0, 8)}`);
        console.log(`   Description: ${newCashbookDescription}\n`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Updated: ${updated} journal entries`);
    console.log(`   Total entries found: ${cashbookEntries.length}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixDisbursementDescriptions();

