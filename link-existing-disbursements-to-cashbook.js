const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function linkExistingDisbursements() {
  try {
    console.log('🔗 Linking existing fund disbursements to their cashbook entries...\n');

    // Get all approved/disbursed fund disbursements without cashbookEntryId
    const disbursements = await prisma.fundDisbursement.findMany({
      where: {
        OR: [
          { status: 'APPROVED' },
          { status: 'DISBURSED' }
        ],
        cashbookEntryId: null
      },
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
    });

    console.log(`Found ${disbursements.length} disbursements without cashbook links.\n`);

    let linked = 0;
    let notFound = 0;

    for (const disbursement of disbursements) {
      const referencePattern = `FD-${disbursement.id.substring(0, 8).toUpperCase()}`;
      const companyName = disbursement.investmentImplementation?.portfolioCompany?.name || '';

      // Search for cashbook entry
      const cashbookEntry = await prisma.cashbookEntry.findFirst({
        where: {
          OR: [
            { reference: referencePattern },
            { reference: { contains: disbursement.id.substring(0, 8) } },
            {
              description: {
                contains: companyName
              },
              amount: disbursement.amount,
              transactionDate: disbursement.disbursementDate,
              type: 'PAYMENT'
            },
            {
              description: {
                contains: 'Fund Disbursement'
              },
              amount: disbursement.amount,
              transactionDate: disbursement.disbursementDate,
              type: 'PAYMENT'
            }
          ]
        }
      });

      if (cashbookEntry) {
        // Link the disbursement to the cashbook entry
        await prisma.fundDisbursement.update({
          where: { id: disbursement.id },
          data: {
            cashbookEntryId: cashbookEntry.id
          }
        });

        console.log(`✅ Linked: ${companyName} - $${Number(disbursement.amount).toLocaleString()}`);
        console.log(`   Disbursement: ${disbursement.id.substring(0, 8)}...`);
        console.log(`   Cashbook: ${cashbookEntry.id.substring(0, 8)}... (${cashbookEntry.reference || 'N/A'})\n`);
        linked++;
      } else {
        console.log(`❌ Not Found: ${companyName} - $${Number(disbursement.amount).toLocaleString()}`);
        console.log(`   Disbursement: ${disbursement.id.substring(0, 8)}...`);
        console.log(`   Date: ${disbursement.disbursementDate.toISOString().split('T')[0]}\n`);
        notFound++;
      }
    }

    console.log('\n📊 Summary:');
    console.log(`   ✅ Linked: ${linked}`);
    console.log(`   ❌ Not Found: ${notFound}`);
    console.log(`   Total: ${disbursements.length}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

linkExistingDisbursements();

