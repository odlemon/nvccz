const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');

const prisma = new PrismaClient();

async function analyzeEntries() {
  console.log('🔍 Analyzing Nov 15 cashbook entries...\n');
  
  const problematicDate = new Date('2025-11-15');
  const startDate = new Date(problematicDate);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(problematicDate);
  endDate.setHours(23, 59, 59, 999);
  
  // Get all cashbook entries from Nov 15
  const entries = await prisma.cashbookEntry.findMany({
    where: {
      transactionDate: {
        gte: startDate,
        lte: endDate
      },
      type: 'RECEIPT',
      status: 'POSTED'
    },
    include: {
      journalEntry: {
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: true
            }
          }
        }
      },
      glAccount: true,
      customer: true
    },
    orderBy: {
      transactionDate: 'asc'
    }
  });
  
  console.log(`📊 Found ${entries.length} cashbook receipts from Nov 15\n`);
  
  // Get Accounts Receivable account
  const arAccount = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1200', isActive: true }
  });
  
  if (!arAccount) {
    console.log('⚠️  Accounts Receivable account (1200) not found');
    return;
  }
  
  console.log('📋 Entry Details:');
  console.log('='.repeat(100));
  
  let totalArCredits = 0;
  
  for (const entry of entries) {
    console.log(`\nEntry ID: ${entry.id}`);
    console.log(`  Date: ${entry.transactionDate.toISOString()}`);
    console.log(`  Description: ${entry.description}`);
    console.log(`  Amount: $${entry.amount}`);
    console.log(`  Counterparty Type: ${entry.counterpartyType}`);
    console.log(`  Customer ID: ${entry.customerId || 'None'}`);
    console.log(`  GL Account ID: ${entry.glAccountId || 'None'}`);
    if (entry.glAccount) {
      console.log(`  GL Account: ${entry.glAccount.accountNo} - ${entry.glAccount.accountName}`);
    }
    if (entry.customer) {
      console.log(`  Customer: ${entry.customer.name}`);
    }
    
    if (entry.journalEntry) {
      console.log(`  Journal Entry: ${entry.journalEntry.referenceNumber}`);
      console.log(`  Journal Entry Lines:`);
      
      for (const line of entry.journalEntry.journalEntryLines) {
        const isAR = line.chartOfAccountId === arAccount.id;
        const marker = isAR ? ' ⚠️  A/R' : '';
        console.log(`    - ${line.chartOfAccount.accountNo} (${line.chartOfAccount.accountName}):`);
        console.log(`      Debit: $${line.debitAmount}, Credit: $${line.creditAmount}${marker}`);
        
        if (isAR && line.creditAmount > 0) {
          totalArCredits += Number(line.creditAmount);
        }
      }
    } else {
      console.log(`  ⚠️  No journal entry linked`);
    }
  }
  
  console.log('\n' + '='.repeat(100));
  console.log(`\n📊 Summary:`);
  console.log(`   Total entries: ${entries.length}`);
  console.log(`   Total A/R credits: $${totalArCredits.toFixed(2)}`);
  console.log(`\n💡 These entries are crediting A/R, which is causing the negative balance.`);
  console.log(`   If these should be Revenue transactions, we need to create correcting entries.`);
  
}

async function main() {
  try {
    await analyzeEntries();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();

