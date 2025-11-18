const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkBankGLAccounts() {
  try {
    console.log('🔍 CHECKING BANK GL ACCOUNTS');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Get all banks
    console.log('STEP 1: Getting all banks...\n');
    const banks = await prisma.bank.findMany({
      where: {
        isActive: true
      },
      include: {
        glAccount: true
      }
    });

    console.log(`✅ Found ${banks.length} active bank(s):\n`);
    banks.forEach((bank, index) => {
      console.log(`   Bank ${index + 1}:`);
      console.log(`      - ID: ${bank.id}`);
      console.log(`      - Name: ${bank.name}`);
      console.log(`      - Account Number: ${bank.accountNumber || 'N/A'}`);
      if (bank.glAccount) {
        console.log(`      - GL Account ID: ${bank.glAccount.id}`);
        console.log(`      - GL Account No: ${bank.glAccount.accountNo}`);
        console.log(`      - GL Account Name: ${bank.glAccount.accountName}`);
        console.log(`      - GL Account Type: ${bank.glAccount.accountType}`);
        if (bank.glAccount.accountNo === '1100') {
          console.log(`      ⚠️  WARNING: This bank is linked to account 1100 (Office Equipment - Fixed Asset)!`);
          console.log(`      This is WRONG - banks should be linked to Current Asset accounts, not Fixed Assets!`);
        }
      } else {
        console.log(`      - GL Account: NOT SET`);
      }
      console.log('');
    });

    // Check account 1100 specifically
    console.log('STEP 2: Checking account 1100...\n');
    const account1100 = await prisma.chartOfAccounts.findFirst({
      where: {
        accountNo: '1100'
      }
    });

    if (account1100) {
      console.log('✅ Account 1100:');
      console.log(`   - Account Name: ${account1100.accountName}`);
      console.log(`   - Account Type: ${account1100.accountType}`);
      
      // Find banks linked to this account
      const banksLinkedTo1100 = banks.filter(b => b.glAccountId === account1100.id);
      console.log(`   - Banks linked to this account: ${banksLinkedTo1100.length}`);
      
      if (banksLinkedTo1100.length > 0) {
        console.log(`   ⚠️  WARNING: Account 1100 is linked to ${banksLinkedTo1100.length} bank(s):`);
        banksLinkedTo1100.forEach(bank => {
          console.log(`      - Bank: ${bank.name} (ID: ${bank.id})`);
        });
        console.log(`   This is WRONG - account 1100 is a Fixed Asset, not a bank account!`);
        console.log(`   The bank "${banksLinkedTo1100[0].name}" should be linked to a Current Asset account (1000-1099 range).`);
      } else {
        console.log(`   ✅ No banks linked to account 1100 (correct)`);
      }
    }
    console.log('');

    // Check the asset journal entry
    console.log('STEP 3: Checking asset journal entry...\n');
    const asset = await prisma.asset.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (asset) {
      const journalEntry = await prisma.journalEntry.findFirst({
        where: {
          referenceNumber: {
            contains: `ASSET-${asset.assetCode}`
          }
        },
        include: {
          cashbookEntries: true
        }
      });

      if (journalEntry) {
        console.log('✅ Asset Journal Entry:');
        console.log(`   - Reference: ${journalEntry.referenceNumber}`);
        console.log(`   - Cashbook Entries: ${journalEntry.cashbookEntries.length}`);
        if (journalEntry.cashbookEntries.length > 0) {
          console.log(`   ⚠️  This journal entry has cashbook entries (unexpected for asset acquisition)`);
          journalEntry.cashbookEntries.forEach(cb => {
            console.log(`      - Cashbook Entry: ${cb.id}, Type: ${cb.type}, Amount: $${cb.amount}`);
          });
        } else {
          console.log(`   ✅ No cashbook entries (correct for asset acquisition)`);
        }
      }
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('📋 SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Total Banks: ${banks.length}`);
    const banksWithAccount1100 = banks.filter(b => b.glAccount?.accountNo === '1100');
    console.log(`Banks linked to account 1100: ${banksWithAccount1100.length}`);
    if (banksWithAccount1100.length > 0) {
      console.log(`⚠️  PROBLEM: ${banksWithAccount1100.length} bank(s) are incorrectly linked to account 1100!`);
      console.log(`   This causes account 1100 to be treated as a bank account in the balance sheet.`);
      console.log(`   Fix: Update the bank(s) to use a proper Current Asset account (1000-1099 range).`);
    } else {
      console.log(`✅ No banks are linked to account 1100 (correct)`);
    }
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkBankGLAccounts();

