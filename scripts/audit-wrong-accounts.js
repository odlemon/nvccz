// @ts-nocheck
/**
 * Audit Script: Find Journal Entries Using Wrong Accounts
 * Run with: node scripts/audit-wrong-accounts.js
 * 
 * Checks for:
 * 1. Asset purchases debited to Accumulated Depreciation (wrong!)
 * 2. Office supplies debited to Accumulated Depreciation (wrong!)
 * 3. Asset acquisitions debited to Current Asset instead of Fixed Asset (wrong!)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findAssetPurchasesInWrongAccount() {
  console.log('\n========================================');
  console.log('1. ASSET PURCHASES IN WRONG ACCOUNTS');
  console.log('========================================\n');

  // Find journal entries that debit Accumulated Depreciation for purchases
  const accumDepAccount = await prisma.chartOfAccounts.findFirst({
    where: {
      accountNo: '1300',
      accountName: { contains: 'Accumulated Depreciation' }
    }
  });

  if (!accumDepAccount) {
    console.log('⚠️  Accumulated Depreciation account not found\n');
    return 0;
  }

  const wrongEntries = await prisma.journalEntry.findMany({
    where: {
      status: { not: 'VOID' },
      OR: [
        { referenceNumber: { contains: 'JE-' } },
        { description: { contains: 'Purchase' } },
        { description: { contains: 'car' } },
        { description: { contains: 'supplies' } }
      ]
    },
    include: {
      journalEntryLines: {
        where: {
          chartOfAccountId: accumDepAccount.id,
          debitAmount: { gt: 0 }
        }
      }
    }
  });

  const issuesFound = wrongEntries.filter(je => je.journalEntryLines.length > 0);

  if (issuesFound.length === 0) {
    console.log('✅ No asset purchases debiting Accumulated Depreciation\n');
    return 0;
  }

  console.log(`❌ Found ${issuesFound.length} entries debiting Accumulated Depreciation (WRONG):\n`);

  for (const je of issuesFound) {
    const allLines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: je.id },
      include: { chartOfAccount: true }
    });

    console.log(`- ID: ${je.id}`);
    console.log(`  Reference: ${je.referenceNumber}`);
    console.log(`  Description: ${je.description}`);
    console.log(`  Amount: $${je.totalAmount}`);
    console.log(`  Date: ${je.transactionDate.toISOString().split('T')[0]}`);
    console.log(`  Status: ${je.status}`);
    console.log(`  Problem: Debiting Accumulated Depreciation for a purchase!`);
    console.log(`  Lines:`);
    allLines.forEach(line => {
      const dr = Number(line.debitAmount) > 0 ? `Dr $${line.debitAmount}` : '';
      const cr = Number(line.creditAmount) > 0 ? `Cr $${line.creditAmount}` : '';
      console.log(`    - ${line.chartOfAccount.accountName} (${line.chartOfAccount.accountNo}): ${dr}${cr}`);
    });
    console.log('');
  }

  return issuesFound.length;
}

async function findAssetsInWrongAccounts() {
  console.log('\n========================================');
  console.log('2. ASSETS RECORDED IN WRONG ACCOUNTS');
  console.log('========================================\n');

  // Find asset acquisition entries that don't use Fixed Asset accounts
  const assetEntries = await prisma.journalEntry.findMany({
    where: {
      referenceNumber: { startsWith: 'ASSET-' },
      status: { not: 'VOID' }
    },
    include: {
      journalEntryLines: {
        include: {
          chartOfAccount: true
        }
      }
    }
  });

  const wrongAccounts = [];

  for (const je of assetEntries) {
    // Check if any debit line uses a non-Fixed Asset account
    const debitLines = je.journalEntryLines.filter(line => Number(line.debitAmount) > 0);
    
    for (const line of debitLines) {
      if (line.chartOfAccount.accountType !== 'Fixed Asset' && 
          !line.chartOfAccount.accountName.includes('Cash')) {
        wrongAccounts.push({
          journalEntry: je,
          wrongLine: line
        });
      }
    }
  }

  if (wrongAccounts.length === 0) {
    console.log('✅ No assets recorded in wrong account types\n');
    return 0;
  }

  console.log(`❌ Found ${wrongAccounts.length} asset entries using wrong accounts:\n`);

  for (const item of wrongAccounts) {
    const je = item.journalEntry;
    const line = item.wrongLine;

    console.log(`- ID: ${je.id}`);
    console.log(`  Reference: ${je.referenceNumber}`);
    console.log(`  Description: ${je.description}`);
    console.log(`  Amount: $${je.totalAmount}`);
    console.log(`  Date: ${je.transactionDate.toISOString().split('T')[0]}`);
    console.log(`  Status: ${je.status}`);
    console.log(`  Problem: Asset debited to "${line.chartOfAccount.accountName}" (${line.chartOfAccount.accountType})`);
    console.log(`  Should use: Fixed Asset account type`);
    console.log('');
  }

  return wrongAccounts.length;
}

async function findSpecificProblemEntries() {
  console.log('\n========================================');
  console.log('3. SPECIFIC PROBLEM ENTRIES FROM AUDIT');
  console.log('========================================\n');

  const problemIds = [
    'cmgofqu6s0001lg04e0nxlw8y', // Purchase company car
    'cmgobvsvc0001l404vv1l06gi', // Office supplies
    'cmgohuz1a0003l604rephl4xo'  // ASSET-ASSET-001
  ];

  let found = 0;

  for (const id of problemIds) {
    const je = await prisma.journalEntry.findUnique({
      where: { id },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      }
    });

    if (!je) {
      continue;
    }

    if (je.status === 'VOID') {
      console.log(`✅ ${je.referenceNumber} - Already VOIDED\n`);
      continue;
    }

    console.log(`❌ ${je.referenceNumber} - Still active with wrong accounts:`);
    console.log(`   ID: ${je.id}`);
    console.log(`   Description: ${je.description}`);
    console.log(`   Status: ${je.status}`);
    console.log(`   Lines:`);
    
    je.journalEntryLines.forEach(line => {
      const dr = Number(line.debitAmount) > 0 ? `Dr $${line.debitAmount}` : '';
      const cr = Number(line.creditAmount) > 0 ? `Cr $${line.creditAmount}` : '';
      const wrong = line.chartOfAccount.accountNo === '1300' || 
                    (je.referenceNumber.includes('ASSET') && line.chartOfAccount.accountType !== 'Fixed Asset' && !line.chartOfAccount.accountName.includes('Cash'));
      console.log(`     ${wrong ? '⚠️ ' : '  '} ${line.chartOfAccount.accountName} (${line.chartOfAccount.accountNo}): ${dr}${cr}`);
    });
    console.log('');
    found++;
  }

  if (found === 0) {
    console.log('✅ All specific problem entries have been fixed or voided\n');
  }

  return found;
}

async function generateSummary(results) {
  console.log('\n========================================');
  console.log('WRONG ACCOUNTS SUMMARY');
  console.log('========================================\n');

  const total = Object.values(results).reduce((sum, count) => sum + count, 0);

  console.log('Issue Counts:');
  console.log(`  - Purchases debiting Accumulated Depr: ${results.accumDeprPurchases}`);
  console.log(`  - Assets in wrong account types: ${results.assetsWrongAccounts}`);
  console.log(`  - Specific problem entries: ${results.specificProblems}`);
  
  console.log('\n' + '='.repeat(40));
  console.log(`  TOTAL WRONG ACCOUNT ISSUES: ${total}`);
  console.log('='.repeat(40) + '\n');

  if (total === 0) {
    console.log('✅ ✅ ✅ EXCELLENT! All accounts are used correctly! ✅ ✅ ✅\n');
  } else {
    console.log('⚠️  ACTION REQUIRED: These entries use wrong accounts.');
    console.log('⚠️  They should be voided and recreated with correct accounts.\n');
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  WRONG ACCOUNTS AUDIT SCRIPT           ║');
  console.log('║  Date: ' + new Date().toISOString().split('T')[0] + '                      ║');
  console.log('╚════════════════════════════════════════╝');

  try {
    const results = {
      accumDeprPurchases: await findAssetPurchasesInWrongAccount(),
      assetsWrongAccounts: await findAssetsInWrongAccounts(),
      specificProblems: await findSpecificProblemEntries()
    };

    await generateSummary(results);

    console.log('✅ Audit completed successfully.\n');

    if (Object.values(results).reduce((sum, count) => sum + count, 0) > 0) {
      console.log('💡 To fix these issues:');
      console.log('   1. Void the incorrect entries');
      console.log('   2. Create new entries with correct accounts');
      console.log('   3. Run this audit again to verify\n');
    }

  } catch (error) {
    console.error('\n❌ Error running audit:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the audit
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });


