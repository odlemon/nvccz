// @ts-nocheck
/**
 * Debug Trial Balance Service
 * 
 * This script debugs the trial balance service to find the issue.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugTrialBalance() {
  console.log('🔍 Debugging Trial Balance Service...');
  console.log('=' .repeat(50));

  try {
    const date = new Date();
    console.log('📅 Date:', date.toISOString().split('T')[0]);

    // Get all active accounts (same as service)
    const accounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true },
      orderBy: [
        { accountType: 'asc' },
        { accountNo: 'asc' }
      ]
    });

    console.log('📚 Active Accounts Found:', accounts.length);
    
    if (accounts.length === 0) {
      console.log('❌ No active accounts found!');
      
      // Check all accounts
      const allAccounts = await prisma.chartOfAccounts.findMany();
      console.log('📚 Total Accounts:', allAccounts.length);
      
      if (allAccounts.length > 0) {
        console.log('📝 Sample Account:');
        const sample = allAccounts[0];
        console.log('  ID:', sample.id);
        console.log('  Account No:', sample.accountNo);
        console.log('  Account Name:', sample.accountName);
        console.log('  Is Active:', sample.isActive);
        console.log('  Account Type:', sample.accountType);
      }
      return;
    }

    const trialBalanceAccounts = [];
    let totalDebits = 0;
    let totalCredits = 0;

    console.log('\n🔍 Processing each account...');

    // Calculate balance for each account (same logic as service)
    for (const account of accounts) {
      console.log(`\n📊 Processing Account: ${account.accountNo} - ${account.accountName}`);
      
      const journalEntries = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: account.id,
          journalEntry: {
            transactionDate: {
              lte: date
            },
            status: 'POSTED'
          }
        },
        include: {
          journalEntry: true
        }
      });

      console.log(`  📄 Journal Entries Found: ${journalEntries.length}`);

      let debitBalance = 0;
      let creditBalance = 0;

      // Sum up debits and credits for this account
      for (const entry of journalEntries) {
        if (entry.debitAmount && entry.debitAmount.gt(0)) {
          debitBalance += entry.debitAmount.toNumber();
        }
        if (entry.creditAmount && entry.creditAmount.gt(0)) {
          creditBalance += entry.creditAmount.toNumber();
        }
      }

      console.log(`  💰 Debit Balance: ${debitBalance}`);
      console.log(`  💰 Credit Balance: ${creditBalance}`);

      // Calculate net balance
      const netBalance = debitBalance - creditBalance;

      // Only include accounts with non-zero balances
      if (debitBalance > 0 || creditBalance > 0) {
        console.log(`  ✅ Adding to trial balance (has balance)`);
        
        trialBalanceAccounts.push({
          accountId: account.id,
          accountName: account.accountName,
          accountNo: account.accountNo,
          accountType: account.accountType,
          debitBalance,
          creditBalance,
          netBalance
        });

        totalDebits += debitBalance;
        totalCredits += creditBalance;
      } else {
        console.log(`  ⏭️ Skipping (no balance)`);
      }
    }

    console.log('\n📊 Trial Balance Results:');
    console.log('  Accounts with Balances:', trialBalanceAccounts.length);
    console.log('  Total Debits:', totalDebits);
    console.log('  Total Credits:', totalCredits);
    console.log('  Is Balanced:', Math.abs(totalDebits - totalCredits) < 0.01);

    if (trialBalanceAccounts.length > 0) {
      console.log('\n📝 Trial Balance Accounts:');
      trialBalanceAccounts.forEach(account => {
        console.log(`  ${account.accountNo} - ${account.accountName}: ${account.netBalance.toFixed(2)}`);
      });
    } else {
      console.log('\n❌ No accounts with balances found!');
    }

  } catch (error) {
    console.error('❌ Error debugging trial balance:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugTrialBalance();
