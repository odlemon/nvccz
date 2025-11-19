const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixAllCashbookDescriptions() {
  try {
    console.log('🔧 Fixing all cashbook journal entry descriptions...\n');

    // Find all journal entries with "Cashbook" in description
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        description: {
          contains: 'Cashbook'
        }
      },
      include: {
        cashbookEntries: {
          take: 1
        }
      }
    });

    console.log(`Found ${journalEntries.length} journal entries with "Cashbook" in description.\n`);

    let updated = 0;

    for (const entry of journalEntries) {
      // Replace "Cashbook RECEIPT" with "Bank Receipt"
      // Replace "Cashbook PAYMENT" with "Bank Payment"
      let newDescription = entry.description;
      
      if (entry.description.includes('Cashbook RECEIPT:')) {
        newDescription = entry.description.replace('Cashbook RECEIPT:', 'Bank Receipt:');
      } else if (entry.description.includes('Cashbook PAYMENT:')) {
        newDescription = entry.description.replace('Cashbook PAYMENT:', 'Bank Payment:');
      } else if (entry.description.includes('Cashbook RECEIPT')) {
        newDescription = entry.description.replace('Cashbook RECEIPT', 'Bank Receipt');
      } else if (entry.description.includes('Cashbook PAYMENT')) {
        newDescription = entry.description.replace('Cashbook PAYMENT', 'Bank Payment');
      }

      if (newDescription !== entry.description) {
        await prisma.journalEntry.update({
          where: { id: entry.id },
          data: {
            description: newDescription
          }
        });

        console.log(`✅ Updated: ${entry.referenceNumber}`);
        console.log(`   Old: ${entry.description}`);
        console.log(`   New: ${newDescription}\n`);
        updated++;
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   ✅ Updated: ${updated} journal entries`);
    console.log(`   Total found: ${journalEntries.length}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixAllCashbookDescriptions();

