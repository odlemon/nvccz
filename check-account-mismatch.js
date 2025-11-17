const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAccountMismatch() {
  try {
    console.log('🔍 CHECKING ACCOUNT MISMATCH');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Step 1: Get account 1100 from Chart of Accounts
    console.log('STEP 1: Getting account 1100 from Chart of Accounts...\n');
    const account1100 = await prisma.chartOfAccounts.findFirst({
      where: {
        accountNo: '1100'
      }
    });

    if (!account1100) {
      console.log('❌ Account 1100 not found in Chart of Accounts');
      return;
    }

    console.log('✅ Account 1100 from Chart of Accounts:');
    console.log(`   - Account ID: ${account1100.id}`);
    console.log(`   - Account No: ${account1100.accountNo}`);
    console.log(`   - Account Name: ${account1100.accountName}`);
    console.log(`   - Account Type: ${account1100.accountType}`);
    console.log(`   - Financial Statement: ${account1100.financialStatement}`);
    console.log(`   - Is Active: ${account1100.isActive}`);
    console.log('');

    // Step 2: Get the asset
    console.log('STEP 2: Getting the asset...\n');
    const asset = await prisma.asset.findFirst({
      orderBy: { createdAt: 'desc' }
    });

    if (!asset) {
      console.log('❌ No asset found');
      return;
    }

    console.log('✅ Asset found:');
    console.log(`   - Asset Name: ${asset.assetName}`);
    console.log(`   - Asset Account ID: ${asset.assetAccountId}`);
    console.log(`   - Matches account1100.id? ${asset.assetAccountId === account1100.id ? 'YES ✅' : 'NO ❌'}`);
    console.log('');

    // Step 3: Get the journal entry for the asset
    console.log('STEP 3: Getting journal entry for asset...\n');
    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: {
          contains: `ASSET-${asset.assetCode}`
        }
      }
    });

    if (!journalEntry) {
      console.log('❌ Journal entry not found');
      return;
    }

    console.log('✅ Journal entry found:');
    console.log(`   - Reference: ${journalEntry.referenceNumber}`);
    console.log(`   - Status: ${journalEntry.status}`);
    console.log('');

    // Step 4: Get journal entry lines
    console.log('STEP 4: Getting journal entry lines...\n');
    const journalLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntryId: journalEntry.id
      },
      include: {
        chartOfAccount: true
      }
    });

    console.log(`✅ Found ${journalLines.length} journal entry line(s):\n`);
    journalLines.forEach((line, index) => {
      console.log(`   Line ${index + 1}:`);
      console.log(`      - Chart of Account ID: ${line.chartOfAccountId}`);
      console.log(`      - Account No: ${line.chartOfAccount.accountNo}`);
      console.log(`      - Account Name: ${line.chartOfAccount.accountName}`);
      console.log(`      - Matches account1100.id? ${line.chartOfAccountId === account1100.id ? 'YES ✅' : 'NO ❌'}`);
      console.log(`      - Debit: $${line.debitAmount}`);
      console.log(`      - Credit: $${line.creditAmount}`);
      console.log('');
    });

    // Step 5: Check what the balance sheet service would fetch
    console.log('STEP 5: Checking what Balance Sheet service fetches...\n');
    const balanceSheetAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        financialStatement: {
          in: ["Balance Sheet", "Balance sheet"]
        },
        isActive: true
      }
    });

    const account1100InBalanceSheet = balanceSheetAccounts.find(acc => acc.accountNo === '1100');
    
    if (account1100InBalanceSheet) {
      console.log('✅ Account 1100 IS in balance sheet accounts:');
      console.log(`   - Account ID: ${account1100InBalanceSheet.id}`);
      console.log(`   - Matches account1100.id? ${account1100InBalanceSheet.id === account1100.id ? 'YES ✅' : 'NO ❌'}`);
      console.log(`   - Matches asset.assetAccountId? ${account1100InBalanceSheet.id === asset.assetAccountId ? 'YES ✅' : 'NO ❌'}`);
      console.log(`   - Matches journal line chartOfAccountId? ${account1100InBalanceSheet.id === journalLines.find(l => l.chartOfAccount.accountNo === '1100')?.chartOfAccountId ? 'YES ✅' : 'NO ❌'}`);
    } else {
      console.log('❌ Account 1100 is NOT in balance sheet accounts');
    }
    console.log('');

    // Step 6: Summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Chart of Accounts Account 1100 ID: ${account1100.id}`);
    console.log(`Asset Account ID: ${asset.assetAccountId}`);
    console.log(`Journal Line Account ID: ${journalLines.find(l => l.chartOfAccount.accountNo === '1100')?.chartOfAccountId || 'N/A'}`);
    console.log(`Balance Sheet Account 1100 ID: ${account1100InBalanceSheet?.id || 'N/A'}`);
    console.log('');
    console.log('All IDs match?', 
      account1100.id === asset.assetAccountId &&
      account1100.id === journalLines.find(l => l.chartOfAccount.accountNo === '1100')?.chartOfAccountId &&
      account1100.id === account1100InBalanceSheet?.id
      ? 'YES ✅' : 'NO ❌'
    );
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkAccountMismatch();

