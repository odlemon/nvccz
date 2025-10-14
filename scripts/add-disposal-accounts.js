// @ts-nocheck
/**
 * Script to Add Asset Disposal Accounts to Chart of Accounts
 * Run with: node scripts/add-disposal-accounts.js
 * 
 * This script adds:
 * 1. Loss on Asset Disposal (Account 5080 - Expense)
 * 2. Gain on Asset Disposal (Account 4030 - Revenue)
 * 
 * These accounts are REQUIRED for balanced asset disposal journal entries.
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addDisposalAccounts() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  ADD ASSET DISPOSAL ACCOUNTS           ║');
  console.log('║  Date: ' + new Date().toISOString().split('T')[0] + '                      ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    // Check if accounts already exist
    console.log('🔍 Checking for existing disposal accounts...\n');

    const existingLossAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: '5080' },
          { accountName: { contains: 'Loss on Asset Disposal' } }
        ]
      }
    });

    const existingGainAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: '4030' },
          { accountName: { contains: 'Gain on Asset Disposal' } }
        ]
      }
    });

    let accountsCreated = 0;

    // Create Loss on Asset Disposal account
    if (existingLossAccount) {
      console.log('✅ Loss on Asset Disposal account already exists:');
      console.log(`   Account #: ${existingLossAccount.accountNo}`);
      console.log(`   Name: ${existingLossAccount.accountName}`);
      console.log(`   Type: ${existingLossAccount.accountType}\n`);
    } else {
      console.log('📝 Creating Loss on Asset Disposal account...');
      
      const lossAccount = await prisma.chartOfAccounts.create({
        data: {
          accountNo: '5080',
          accountName: 'Loss on Asset Disposal',
          accountType: 'Expense',
          financialStatement: 'Income Statement',
          notes: 'Losses incurred when assets are sold below book value',
          isActive: true
        }
      });

      console.log('✅ Created Loss on Asset Disposal account:');
      console.log(`   Account #: ${lossAccount.accountNo}`);
      console.log(`   Name: ${lossAccount.accountName}`);
      console.log(`   Type: ${lossAccount.accountType}\n`);
      
      accountsCreated++;
    }

    // Create Gain on Asset Disposal account
    if (existingGainAccount) {
      console.log('✅ Gain on Asset Disposal account already exists:');
      console.log(`   Account #: ${existingGainAccount.accountNo}`);
      console.log(`   Name: ${existingGainAccount.accountName}`);
      console.log(`   Type: ${existingGainAccount.accountType}\n`);
    } else {
      console.log('📝 Creating Gain on Asset Disposal account...');
      
      const gainAccount = await prisma.chartOfAccounts.create({
        data: {
          accountNo: '4030',
          accountName: 'Gain on Asset Disposal',
          accountType: 'Revenue',
          financialStatement: 'Income Statement',
          notes: 'Gains earned when assets are sold above book value',
          isActive: true
        }
      });

      console.log('✅ Created Gain on Asset Disposal account:');
      console.log(`   Account #: ${gainAccount.accountNo}`);
      console.log(`   Name: ${gainAccount.accountName}`);
      console.log(`   Type: ${gainAccount.accountType}\n`);
      
      accountsCreated++;
    }

    // Summary
    console.log('═'.repeat(40));
    console.log('SUMMARY');
    console.log('═'.repeat(40));
    
    if (accountsCreated === 0) {
      console.log('✅ All required accounts already exist!');
      console.log('   No changes were made.\n');
    } else {
      console.log(`✅ Successfully created ${accountsCreated} new account(s)!`);
      console.log('   Your chart of accounts is now ready for asset disposals.\n');
    }

    // Display account usage information
    console.log('📖 USAGE INFORMATION:');
    console.log('═'.repeat(40));
    console.log('These accounts are automatically used by AssetService when:');
    console.log('  • An asset is disposed (sold, scrapped, donated, etc.)');
    console.log('  • The disposal value differs from the book value\n');
    
    console.log('Examples:');
    console.log('  1. Loss Scenario:');
    console.log('     - Asset Cost: $10,000');
    console.log('     - Accumulated Depreciation: $3,000');
    console.log('     - Book Value: $7,000');
    console.log('     - Sold for: $5,000');
    console.log('     → Loss on Disposal: $2,000 (debited to account 5080)\n');
    
    console.log('  2. Gain Scenario:');
    console.log('     - Asset Cost: $10,000');
    console.log('     - Accumulated Depreciation: $8,000');
    console.log('     - Book Value: $2,000');
    console.log('     - Sold for: $3,000');
    console.log('     → Gain on Disposal: $1,000 (credited to account 4030)\n');

    console.log('✅ Setup complete! Your system can now handle asset disposals correctly.\n');

  } catch (error) {
    console.error('\n❌ Error adding disposal accounts:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
addDisposalAccounts()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });


