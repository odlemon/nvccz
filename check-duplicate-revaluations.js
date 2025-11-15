const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDuplicateRevaluations() {
  console.log('🔍 Checking Duplicate REV-FX Revaluation Entries\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Find all REV-FX entries
  const revFxEntries = await prisma.journalEntry.findMany({
    where: {
      referenceNumber: {
        startsWith: 'REV-FX-'
      }
    },
    include: {
      journalEntryLines: {
        include: {
          chartOfAccount: {
            select: {
              accountNo: true,
              accountName: true
            }
          }
        }
      },
      currency: true
    },
    orderBy: {
      transactionDate: 'desc'
    }
  });

  console.log(`Found ${revFxEntries.length} REV-FX entries\n`);

  // Group by date and amount
  const grouped = new Map();
  
  revFxEntries.forEach(entry => {
    const date = entry.transactionDate.toISOString().split('T')[0];
    const cashLine = entry.journalEntryLines.find(l => 
      l.chartOfAccount.accountNo === '1000' || 
      l.chartOfAccount.accountName.includes('Cash')
    );
    
    if (cashLine) {
      const credit = parseFloat(cashLine.creditAmount.toString());
      const key = `${date}_${credit}`;
      
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key).push({
        id: entry.id,
        ref: entry.referenceNumber,
        date: date,
        description: entry.description,
        currency: entry.currency?.code || 'N/A',
        credit: credit,
        createdAt: entry.createdAt
      });
    }
  });

  console.log('Duplicate REV-FX Entries (same date and amount):\n');
  
  let duplicateCount = 0;
  grouped.forEach((entries, key) => {
    if (entries.length > 1) {
      duplicateCount++;
      const [date, amount] = key.split('_');
      console.log(`Date: ${date}, Amount: ${parseFloat(amount).toFixed(2)}`);
      console.log(`   Found ${entries.length} duplicate entries:\n`);
      
      entries.forEach((entry, idx) => {
        console.log(`   ${idx + 1}. ${entry.ref}`);
        console.log(`      ID: ${entry.id}`);
        console.log(`      Description: ${entry.description}`);
        console.log(`      Currency: ${entry.currency}`);
        console.log(`      Created: ${entry.createdAt.toISOString()}`);
        console.log('');
      });
    }
  });

  if (duplicateCount === 0) {
    console.log('✅ No duplicate REV-FX entries found (by date and amount)\n');
  } else {
    console.log(`\n⚠️  Found ${duplicateCount} groups of duplicate entries\n`);
  }

  // Check the specific 3 entries from Account 1000
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Checking the 3 large REV-FX entries for Account 1000:\n');
  
  const account1000 = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1000' }
  });

  if (account1000) {
    const largeRevFx = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: account1000.id,
        journalEntry: {
          referenceNumber: {
            startsWith: 'REV-FX-'
          }
        }
      },
      include: {
        journalEntry: {
          include: {
            currency: true,
            createdBy: {
              select: {
                email: true,
                firstName: true,
                lastName: true
              }
            }
          }
        }
      },
      orderBy: {
        journalEntry: {
          transactionDate: 'desc'
        }
      }
    });

    console.log(`Found ${largeRevFx.length} REV-FX entries for Account 1000:\n`);
    
    largeRevFx.forEach((line, idx) => {
      const je = line.journalEntry;
      const credit = parseFloat(line.creditAmount.toString());
      console.log(`${idx + 1}. ${je.referenceNumber}`);
      console.log(`   Date: ${je.transactionDate.toISOString().split('T')[0]}`);
      console.log(`   Description: ${je.description}`);
      console.log(`   Currency: ${je.currency?.code || 'N/A'}`);
      console.log(`   Credit Amount: ${credit.toFixed(2)}`);
      console.log(`   Created By: ${je.createdBy?.email || 'N/A'}`);
      console.log(`   Created At: ${je.createdAt.toISOString()}`);
      console.log('');
    });
  }

  await prisma.$disconnect();
}

checkDuplicateRevaluations();

