// @ts-nocheck
/**
 * Test Trial Balance
 * 
 * This script tests the trial balance functionality to see why it's not showing data.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testTrialBalance() {
  console.log('🔍 Testing Trial Balance...');
  console.log('=' .repeat(50));

  try {
    // Check if we have journal entries
    const journalEntries = await prisma.journalEntry.findMany({
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      }
    });
    
    console.log('📊 Journal Entries Found:', journalEntries.length);
    
    if (journalEntries.length > 0) {
      console.log('\n📝 First Journal Entry:');
      const firstEntry = journalEntries[0];
      console.log('  Reference:', firstEntry.referenceNumber);
      console.log('  Description:', firstEntry.description);
      console.log('  Status:', firstEntry.status);
      console.log('  Date:', firstEntry.transactionDate);
      console.log('  Lines:', firstEntry.journalEntryLines.length);
      
      console.log('\n📄 Journal Entry Lines:');
      firstEntry.journalEntryLines.forEach((line, index) => {
        console.log(`  Line ${index + 1}:`);
        console.log('    Account:', line.chartOfAccount.accountNo + ' - ' + line.chartOfAccount.accountName);
        console.log('    Debit:', line.debitAmount.toString());
        console.log('    Credit:', line.creditAmount.toString());
      });
    }

    // Check journal entry lines directly
    const journalLines = await prisma.journalEntryLine.findMany({
      include: {
        chartOfAccount: true,
        journalEntry: true
      }
    });
    
    console.log('\n📄 Journal Entry Lines Found:', journalLines.length);
    
    if (journalLines.length > 0) {
      console.log('\n📝 Sample Journal Line:');
      const sampleLine = journalLines[0];
      console.log('  Account:', sampleLine.chartOfAccount.accountNo + ' - ' + sampleLine.chartOfAccount.accountName);
      console.log('  Debit:', sampleLine.debitAmount.toString());
      console.log('  Credit:', sampleLine.creditAmount.toString());
      console.log('  Journal Entry Status:', sampleLine.journalEntry.status);
    }

    // Check chart of accounts
    const accounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true }
    });
    
    console.log('\n📚 Chart of Accounts Found:', accounts.length);
    
    if (accounts.length > 0) {
      console.log('\n📝 Sample Account:');
      const sampleAccount = accounts[0];
      console.log('  Account No:', sampleAccount.accountNo);
      console.log('  Account Name:', sampleAccount.accountName);
      console.log('  Account Type:', sampleAccount.accountType);
      console.log('  Is Active:', sampleAccount.isActive);
    }

    // Test trial balance calculation
    console.log('\n⚖️ Testing Trial Balance Calculation...');
    
    const asOfDate = new Date();
    console.log('  As of Date:', asOfDate.toISOString().split('T')[0]);
    
    // Get all active accounts
    const activeAccounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true },
      orderBy: { accountNo: 'asc' }
    });
    
    console.log('  Active Accounts:', activeAccounts.length);
    
    let totalDebits = 0;
    let totalCredits = 0;
    let accountsWithBalances = 0;
    
    for (const account of activeAccounts) {
      const journalEntries = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: account.id,
          journalEntry: {
            transactionDate: {
              lte: asOfDate
            },
            status: 'POSTED'
          }
        }
      });
      
      let debitBalance = 0;
      let creditBalance = 0;
      
      for (const entry of journalEntries) {
        if (entry.debitAmount && entry.debitAmount.gt(0)) {
          debitBalance += entry.debitAmount.toNumber();
        }
        if (entry.creditAmount && entry.creditAmount.gt(0)) {
          creditBalance += entry.creditAmount.toNumber();
        }
      }
      
      if (debitBalance > 0 || creditBalance > 0) {
        accountsWithBalances++;
        totalDebits += debitBalance;
        totalCredits += creditBalance;
        
        console.log(`  ${account.accountNo} - ${account.accountName}:`);
        console.log(`    Debit: ${debitBalance.toFixed(2)}`);
        console.log(`    Credit: ${creditBalance.toFixed(2)}`);
        console.log(`    Net: ${(debitBalance - creditBalance).toFixed(2)}`);
      }
    }
    
    console.log('\n📊 Trial Balance Summary:');
    console.log('  Accounts with Balances:', accountsWithBalances);
    console.log('  Total Debits:', totalDebits.toFixed(2));
    console.log('  Total Credits:', totalCredits.toFixed(2));
    console.log('  Difference:', (totalDebits - totalCredits).toFixed(2));
    console.log('  Is Balanced:', Math.abs(totalDebits - totalCredits) < 0.01 ? '✅ YES' : '❌ NO');

  } catch (error) {
    console.error('❌ Error testing trial balance:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testTrialBalance();
