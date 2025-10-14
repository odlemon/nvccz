// @ts-nocheck
/**
 * Script to Fix Journal Entries Using Wrong Accounts
 * Run with: node scripts/fix-wrong-account-entries.js
 * 
 * Fixes:
 * 1. Company car purchase ($24,000) - Change from Accumulated Depr to Fixed Asset
 * 2. Office supplies ($500) - Change from Accumulated Depr to Expense
 * 3. Asset acquisition ($1,000) - Change from Current Asset to Fixed Asset
 */

const { PrismaClient, Decimal } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixWrongAccountEntries() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  FIX WRONG ACCOUNT ENTRIES             ║');
  console.log('║  Date: ' + new Date().toISOString().split('T')[0] + '                      ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    // Get required accounts
    console.log('🔍 Getting required accounts...\n');

    const accounts = {
      cash: await prisma.chartOfAccounts.findFirst({
        where: { accountNo: '1000' }
      }),
      fixedAsset: await prisma.chartOfAccounts.findFirst({
        where: { accountNo: '1100', accountType: 'Fixed Asset' }
      }),
      officeSuppliesExpense: await prisma.chartOfAccounts.findFirst({
        where: { accountNo: '5020', accountType: 'Expense' }
      })
    };

    if (!accounts.cash || !accounts.fixedAsset || !accounts.officeSuppliesExpense) {
      throw new Error('Required accounts not found!');
    }

    console.log('✅ Required accounts found:');
    console.log(`   - Cash: ${accounts.cash.accountName} (${accounts.cash.accountNo})`);
    console.log(`   - Fixed Asset: ${accounts.fixedAsset.accountName} (${accounts.fixedAsset.accountNo})`);
    console.log(`   - Office Expense: ${accounts.officeSuppliesExpense.accountName} (${accounts.officeSuppliesExpense.accountNo})\n`);

    const fixes = [
      {
        id: 'cmgofqu6s0001lg04e0nxlw8y',
        name: 'Company Car Purchase',
        description: 'Purchase company car from zimoko worth 24000 (CORRECTED)',
        amount: 24000,
        correctAccount: accounts.fixedAsset,
        reason: 'Fixed asset purchase should debit Fixed Asset account, not Accumulated Depreciation'
      },
      {
        id: 'cmgobvsvc0001l404vv1l06gi',
        name: 'Office Supplies',
        description: 'Office supplies purchase (CORRECTED)',
        amount: 500,
        correctAccount: accounts.officeSuppliesExpense,
        reason: 'Office supplies are an expense, not an asset depreciation adjustment'
      },
      {
        id: 'cmgohuz1a0003l604rephl4xo',
        name: 'Asset Acquisition',
        description: 'Asset acquisition: Office Computer (CORRECTED)',
        amount: 1000,
        correctAccount: accounts.fixedAsset,
        reason: 'Asset acquisition should debit Fixed Asset account, not Current Asset'
      }
    ];

    let fixed = 0;

    for (const fix of fixes) {
      try {
        console.log(`\n📋 Processing: ${fix.name}`);
        console.log(`   Entry ID: ${fix.id}`);
        console.log(`   Amount: $${fix.amount.toFixed(2)}`);

        // Get the original entry
        const originalEntry = await prisma.journalEntry.findUnique({
          where: { id: fix.id },
          include: {
            journalEntryLines: {
              include: {
                chartOfAccount: true
              }
            }
          }
        });

        if (!originalEntry) {
          console.log('   ⚠️  Entry not found, skipping');
          continue;
        }

        if (originalEntry.status === 'VOID') {
          console.log('   ✅ Entry already voided');
          continue;
        }

        console.log(`   Original: ${originalEntry.referenceNumber}`);
        console.log(`   Reason: ${fix.reason}`);

        // Void the original entry
        await prisma.journalEntry.update({
          where: { id: fix.id },
          data: { status: 'VOID' }
        });

        console.log('   ✅ Original entry voided');

        // Create new correct entry
        const newEntry = await prisma.journalEntry.create({
          data: {
            transactionDate: originalEntry.transactionDate,
            referenceNumber: `${originalEntry.referenceNumber}-FIX`,
            description: fix.description,
            totalAmount: new Decimal(fix.amount),
            currencyId: originalEntry.currencyId,
            status: 'POSTED',
            createdById: originalEntry.createdById
          }
        });

        // Create journal entry lines with CORRECT account
        // Dr Correct Account (Fixed Asset or Expense)
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: newEntry.id,
            chartOfAccountId: fix.correctAccount.id,
            debitAmount: new Decimal(fix.amount),
            creditAmount: new Decimal(0),
            description: fix.description,
            vatAmount: new Decimal(0)
          }
        });

        // Cr Cash
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: newEntry.id,
            chartOfAccountId: accounts.cash.id,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(fix.amount),
            description: 'Cash payment',
            vatAmount: new Decimal(0)
          }
        });

        console.log(`   ✅ Created corrected entry: ${newEntry.referenceNumber}`);
        console.log(`      Dr ${fix.correctAccount.accountName}: $${fix.amount.toFixed(2)}`);
        console.log(`      Cr ${accounts.cash.accountName}: $${fix.amount.toFixed(2)}`);
        
        fixed++;

      } catch (error) {
        console.error(`   ❌ Error processing ${fix.name}:`, error.message);
      }
    }

    // Summary
    console.log('\n═'.repeat(40));
    console.log('SUMMARY');
    console.log('═'.repeat(40));
    console.log(`✅ Fixed ${fixed} out of ${fixes.length} entries with wrong accounts`);
    console.log(`\nOriginal entries voided, corrected entries created with "-FIX" suffix\n`);

    return fixed;

  } catch (error) {
    console.error('\n❌ Error fixing entries:', error.message);
    console.error(error);
    throw error;
  }
}

async function main() {
  try {
    const fixed = await fixWrongAccountEntries();
    
    if (fixed > 0) {
      console.log('🎉 All wrong account entries have been fixed!');
      console.log('\n📝 Next Step: Run audit script to verify:');
      console.log('   node scripts/audit-wrong-accounts.js\n');
    }

  } catch (error) {
    console.error('\n❌ Script failed:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });


