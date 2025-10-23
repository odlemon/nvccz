// @ts-nocheck
/**
 * Fix Chart of Accounts isActive Field
 * 
 * This script ensures all chart of accounts are marked as active.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixChartOfAccountsActive() {
  console.log('🔧 Fixing Chart of Accounts isActive Field...');
  console.log('=' .repeat(50));

  try {
    // Check current status
    const allAccounts = await prisma.chartOfAccounts.findMany();
    const activeAccounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true }
    });

    console.log('📊 Current Status:');
    console.log('  Total Accounts:', allAccounts.length);
    console.log('  Active Accounts:', activeAccounts.length);
    console.log('  Inactive Accounts:', allAccounts.length - activeAccounts.length);

    if (allAccounts.length > 0) {
      const sample = allAccounts[0];
      console.log('\n📝 Sample Account:');
      console.log('  Account No:', sample.accountNo);
      console.log('  Account Name:', sample.accountName);
      console.log('  Is Active:', sample.isActive);
    }

    // Update all accounts to be active
    const updateResult = await prisma.chartOfAccounts.updateMany({
      where: { isActive: false },
      data: { isActive: true }
    });

    console.log('\n✅ Updated Accounts:', updateResult.count);

    // Check final status
    const finalActiveAccounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true }
    });

    console.log('\n📊 Final Status:');
    console.log('  Active Accounts:', finalActiveAccounts.length);
    console.log('  All accounts are now active!');

  } catch (error) {
    console.error('❌ Error fixing chart of accounts:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixChartOfAccountsActive();
