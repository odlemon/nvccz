// @ts-nocheck
/**
 * Test Trial Balance Service Directly
 * 
 * This script tests the actual TrialBalanceService to see what's happening.
 */

import { PrismaClient } from '@prisma/client';
import { TrialBalanceService } from '../src/services/TrialBalanceService';

const prisma = new PrismaClient();

async function testTrialBalanceService() {
  console.log('🔍 Testing Trial Balance Service Directly...');
  console.log('=' .repeat(50));

  try {
    const date = new Date();
    console.log('📅 Date:', date.toISOString().split('T')[0]);

    // Call the actual service
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
      
      // Debug: Check what the service is doing
      console.log('\n🔍 Debugging Service Logic...');
      
      // Get all active accounts (same as service)
      const accounts = await prisma.chartOfAccounts.findMany({
        where: { isActive: true },
        orderBy: [
          { accountType: 'asc' },
          { accountNo: 'asc' }
        ]
      });

      console.log('  Active Accounts Found:', accounts.length);
      
      if (accounts.length > 0) {
        const sampleAccount = accounts[0];
        console.log('  Sample Account:', sampleAccount.accountNo, '-', sampleAccount.accountName);
        console.log('  Sample Account isActive:', sampleAccount.isActive);
        
        // Check journal entries for this account
        const journalEntries = await prisma.journalEntryLine.findMany({
          where: {
            chartOfAccountId: sampleAccount.id,
            journalEntry: {
              transactionDate: {
                lte: date
              },
              status: 'POSTED'
            }
          }
        });
        
        console.log('  Journal Entries for Sample Account:', journalEntries.length);
        
        if (journalEntries.length > 0) {
          const sampleEntry = journalEntries[0];
          console.log('  Sample Entry Debit:', sampleEntry.debitAmount.toString());
          console.log('  Sample Entry Credit:', sampleEntry.creditAmount.toString());
        }
      }
    }

  } catch (error) {
    console.error('❌ Error testing trial balance service:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testTrialBalanceService();
