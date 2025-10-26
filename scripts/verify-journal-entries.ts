import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyJournalEntries() {
  try {
    console.log('🔍 Verifying Journal Entries and Amounts...\n');
    
    // Get all journal entries from today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    console.log(`📅 Checking journal entries from: ${today.toISOString()}`);
    console.log(`📅 To: ${tomorrow.toISOString()}\n`);
    
    // Get journal entries from today
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        createdAt: {
          gte: today,
          lt: tomorrow
        }
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        },
        currency: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`📊 Found ${journalEntries.length} journal entries from today:\n`);
    
    for (const entry of journalEntries) {
      console.log(`📝 Journal Entry: ${entry.referenceNumber}`);
      console.log(`   Description: ${entry.description}`);
      console.log(`   Total Amount: $${entry.totalAmount}`);
      console.log(`   Status: ${entry.status}`);
      console.log(`   Created: ${entry.createdAt}`);
      console.log(`   Currency: ${entry.currency?.code || 'N/A'}`);
      
      console.log('\n   📋 Journal Entry Lines:');
      let totalDebits = 0;
      let totalCredits = 0;
      
      for (const line of entry.journalEntryLines) {
        const debitAmount = Number(line.debitAmount);
        const creditAmount = Number(line.creditAmount);
        
        totalDebits += debitAmount;
        totalCredits += creditAmount;
        
        if (debitAmount > 0) {
          console.log(`   Dr. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName} $${debitAmount.toFixed(2)}`);
        }
        if (creditAmount > 0) {
          console.log(`   Cr. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName} $${creditAmount.toFixed(2)}`);
        }
      }
      
      console.log(`   📊 Total Debits: $${totalDebits.toFixed(2)}`);
      console.log(`   📊 Total Credits: $${totalCredits.toFixed(2)}`);
      console.log(`   ✅ Balanced: ${Math.abs(totalDebits - totalCredits) < 0.01 ? 'Yes' : 'No'}`);
      
      console.log('\n' + '='.repeat(80) + '\n');
    }
    
    // Also check expenses to see if they have journal entry references
    console.log('🔍 Checking Expenses for Journal Entry References...\n');
    
    const expenses = await prisma.expense.findMany({
      where: {
        receiptNumber: { in: ['BANK-EXP-001', 'CREDIT-EXP-001'] }
      },
      include: {
        journalEntry: true
      }
    });
    
    console.log(`📋 Found ${expenses.length} expenses:\n`);
    
    for (const expense of expenses) {
      console.log(`💰 Expense: ${expense.description}`);
      console.log(`   Amount: $${expense.amount}`);
      console.log(`   VAT: $${expense.vatAmount}`);
      console.log(`   Total: $${expense.totalAmount}`);
      console.log(`   Status: ${expense.status}`);
      console.log(`   Journal Entry ID: ${expense.journalEntryId || 'None'}`);
      
      if (expense.journalEntry) {
        console.log(`   Journal Entry Ref: ${expense.journalEntry.referenceNumber}`);
        console.log(`   Journal Entry Status: ${expense.journalEntry.status}`);
      } else {
        console.log(`   ❌ No journal entry linked!`);
      }
      
      console.log('\n' + '='.repeat(80) + '\n');
    }
    
    // Check if there are any journal entries with EXP- prefix
    const expJournalEntries = await prisma.journalEntry.findMany({
      where: {
        referenceNumber: {
          startsWith: 'EXP-'
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
    
    console.log(`🔍 Found ${expJournalEntries.length} EXP- journal entries:\n`);
    
    for (const entry of expJournalEntries) {
      console.log(`📝 ${entry.referenceNumber} - ${entry.description}`);
      console.log(`   Created: ${entry.createdAt}`);
      console.log(`   Status: ${entry.status}`);
      console.log(`   Total Amount: $${entry.totalAmount}`);
      
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
    
  } catch (error: any) {
    console.error('❌ Error verifying journal entries:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyJournalEntries();



