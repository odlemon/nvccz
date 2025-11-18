const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateDatabase() {
  try {
    console.log('🔧 Updating database: Adding cashbook_entry_id to fund_disbursements...\n');

    // Check if column exists
    const checkColumn = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'fund_disbursements' 
      AND column_name = 'cashbook_entry_id'
    `;

    if (checkColumn.length > 0) {
      console.log('✅ Column cashbook_entry_id already exists\n');
    } else {
      // Add the column
      console.log('📝 Adding cashbook_entry_id column...');
      await prisma.$executeRaw`
        ALTER TABLE fund_disbursements 
        ADD COLUMN cashbook_entry_id VARCHAR(255) UNIQUE
      `;
      console.log('✅ Column added\n');

      // Add foreign key constraint
      console.log('📝 Adding foreign key constraint...');
      try {
        await prisma.$executeRaw`
          ALTER TABLE fund_disbursements
          ADD CONSTRAINT fund_disbursements_cashbook_entry_id_fkey 
          FOREIGN KEY (cashbook_entry_id) 
          REFERENCES cashbook_entries(id) 
          ON DELETE SET NULL
        `;
        console.log('✅ Foreign key constraint added\n');
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log('✅ Foreign key constraint already exists\n');
        } else {
          throw error;
        }
      }
    }

    // Now link existing disbursements
    console.log('🔗 Linking existing disbursements to cashbook entries...\n');

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

    console.log(`Found ${disbursements.length} disbursements to link.\n`);

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

    console.log('✅ Database update complete!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateDatabase();

