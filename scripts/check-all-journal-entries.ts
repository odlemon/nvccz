import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAllJournalEntries() {
  try {
    console.log('🔍 Checking ALL Journal Entries...\n');
    
    // Get all journal entries ordered by creation date
    const allJournalEntries = await prisma.journalEntry.findMany({
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        },
        currency: true
      },
      orderBy: { createdAt: 'desc' },
      take: 10 // Get last 10 entries
    });
    
    console.log(`📊 Found ${allJournalEntries.length} recent journal entries:\n`);
    
    for (const entry of allJournalEntries) {
      console.log(`📝 ${entry.referenceNumber}`);
      console.log(`   Description: ${entry.description}`);
      console.log(`   Total Amount: $${entry.totalAmount}`);
      console.log(`   Status: ${entry.status}`);
      console.log(`   Created: ${entry.createdAt.toISOString()}`);
      console.log(`   Currency: ${entry.currency?.code || 'N/A'}`);
      
      console.log('   📋 Lines:');
      for (const line of entry.journalEntryLines) {
        const debitAmount = Number(line.debitAmount);
        const creditAmount = Number(line.creditAmount);
        
        if (debitAmount > 0) {
          console.log(`   Dr. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName} $${debitAmount.toFixed(2)}`);
        }
        if (creditAmount > 0) {
          console.log(`   Cr. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName} $${creditAmount.toFixed(2)}`);
        }
      }
      
      console.log('\n' + '='.repeat(80) + '\n');
    }
    
    // Check if there are any journal entries from yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterdayEntries = await prisma.journalEntry.findMany({
      where: {
        createdAt: {
          gte: yesterday,
          lt: today
        }
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`📅 Journal Entries from Yesterday (${yesterday.toISOString().split('T')[0]}): ${yesterdayEntries.length}\n`);
    
    for (const entry of yesterdayEntries) {
      console.log(`📝 ${entry.referenceNumber} - ${entry.description}`);
      console.log(`   Amount: $${entry.totalAmount}`);
      console.log(`   Created: ${entry.createdAt.toISOString()}`);
    }
    
  } catch (error: any) {
    console.error('❌ Error checking journal entries:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllJournalEntries();



