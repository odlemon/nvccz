// @ts-nocheck
/**
 * Test Trial Balance with Specific Date
 * 
 * This script tests the trial balance with the exact date you're using.
 */

import { PrismaClient } from '@prisma/client';
import { TrialBalanceService } from '../src/services/TrialBalanceService';

const prisma = new PrismaClient();

async function testTrialBalanceWithDate() {
  console.log('🔍 Testing Trial Balance with Date: 2025-10-23...');
  console.log('=' .repeat(50));

  try {
    // Use the exact date you're calling
    const date = new Date('2025-10-23');
    console.log('📅 Date:', date.toISOString().split('T')[0]);
    console.log('📅 Date Object:', date);

    // Call the actual service with your exact date
    const trialBalance = await TrialBalanceService.generateTrialBalance(date);
    
    console.log('\n📊 Trial Balance Service Results:');
    console.log('  Date:', trialBalance.date);
    console.log('  Accounts Count:', trialBalance.accounts.length);
    console.log('  Total Debits:', trialBalance.totals.totalDebits);
    console.log('  Total Credits:', trialBalance.totals.totalCredits);
    console.log('  Is Balanced:', trialBalance.totals.isBalanced);

    if (trialBalance.accounts.length > 0) {
      console.log('\n📝 Trial Balance Accounts:');
      trialBalance.accounts.forEach(account => {
        console.log(`  ${account.accountNo} - ${account.accountName}: ${account.netBalance.toFixed(2)}`);
      });
    } else {
      console.log('\n❌ No accounts found in trial balance!');
      
      // Debug: Check what's happening with the date filter
      console.log('\n🔍 Debugging Date Filter...');
      
      // Check journal entries with date filter
      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          transactionDate: {
            lte: date
          },
          status: 'POSTED'
        }
      });
      
      console.log('  Journal Entries <= 2025-10-23:', journalEntries.length);
      
      if (journalEntries.length > 0) {
        console.log('  Sample Journal Entry:');
        const sample = journalEntries[0];
        console.log('    Reference:', sample.referenceNumber);
        console.log('    Date:', sample.transactionDate);
        console.log('    Status:', sample.status);
      }
      
      // Check journal entry lines with date filter
      const journalLines = await prisma.journalEntryLine.findMany({
        where: {
          journalEntry: {
            transactionDate: {
              lte: date
            },
            status: 'POSTED'
          }
        }
      });
      
      console.log('  Journal Entry Lines <= 2025-10-23:', journalLines.length);
      
      if (journalLines.length > 0) {
        console.log('  Sample Journal Line:');
        const sample = journalLines[0];
        console.log('    Debit:', sample.debitAmount.toString());
        console.log('    Credit:', sample.creditAmount.toString());
        console.log('    Journal Entry Date:', sample.journalEntry.transactionDate);
        console.log('    Journal Entry Status:', sample.journalEntry.status);
      }
    }

  } catch (error) {
    console.error('❌ Error testing trial balance with date:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testTrialBalanceWithDate();
