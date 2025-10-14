// @ts-nocheck
/**
 * Script to Fix Voided Asset Disposal Journal Entries
 * Run with: node scripts/fix-asset-disposal-entries.js
 * 
 * This script:
 * 1. Finds voided asset disposal entries
 * 2. Gets the original asset details
 * 3. Creates new, properly balanced journal entries
 * 4. Uses the new Loss/Gain accounts we just created
 */

const { PrismaClient, Decimal } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixAssetDisposalEntries() {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║  FIX ASSET DISPOSAL ENTRIES            ║');
  console.log('║  Date: ' + new Date().toISOString().split('T')[0] + '                      ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    // Find voided disposal entries
    console.log('🔍 Finding voided asset disposal entries...\n');

    const voidedDisposals = await prisma.journalEntry.findMany({
      where: {
        referenceNumber: {
          startsWith: 'DISPOSAL-'
        },
        status: 'VOID'
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      }
    });

    if (voidedDisposals.length === 0) {
      console.log('✅ No voided disposal entries found. Nothing to fix!\n');
      return 0;
    }

    console.log(`Found ${voidedDisposals.length} voided disposal entries:\n`);
    
    voidedDisposals.forEach(je => {
      console.log(`- ${je.referenceNumber} (${je.description})`);
    });

    console.log('\n📝 Creating new balanced disposal entries...\n');

    // Get required accounts
    const cashAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountName: { contains: 'Cash' },
        isActive: true
      }
    });

    const lossAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountNo: '5080' // Loss on Asset Disposal
      }
    });

    const gainAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        accountNo: '4030' // Gain on Asset Disposal
      }
    });

    if (!cashAccount) {
      throw new Error('Cash account not found!');
    }

    if (!lossAccount || !gainAccount) {
      throw new Error('Loss/Gain accounts not found! Run add-disposal-accounts.js first.');
    }

    console.log('✅ Required accounts found:');
    console.log(`   - Cash: ${cashAccount.accountName} (${cashAccount.accountNo})`);
    console.log(`   - Loss: ${lossAccount.accountName} (${lossAccount.accountNo})`);
    console.log(`   - Gain: ${gainAccount.accountName} (${gainAccount.accountNo})\n`);

    let fixed = 0;

    for (const voidedEntry of voidedDisposals) {
      try {
        console.log(`\n📋 Processing: ${voidedEntry.referenceNumber}`);
        console.log(`   Description: ${voidedEntry.description}`);

        // Extract asset info from the voided entry
        const assetLine = voidedEntry.journalEntryLines.find(
          line => Number(line.creditAmount) > 0 && 
                  line.chartOfAccount.accountType === 'Fixed Asset'
        );

        const cashLine = voidedEntry.journalEntryLines.find(
          line => Number(line.debitAmount) > 0 && 
                  line.chartOfAccount.accountName.includes('Cash')
        );

        const accumDepLine = voidedEntry.journalEntryLines.find(
          line => line.chartOfAccount.accountType === 'Contra-Asset'
        );

        if (!assetLine || !cashLine) {
          console.log('   ⚠️  Skipping - Cannot determine asset details from voided entry');
          continue;
        }

        const assetCost = Number(assetLine.creditAmount);
        const disposalValue = Number(cashLine.debitAmount);
        const accumDepr = accumDepLine ? Number(accumDepLine.debitAmount) : 0;
        const bookValue = assetCost - accumDepr;
        const gainLoss = disposalValue - bookValue;

        console.log(`   Asset Cost: $${assetCost.toFixed(2)}`);
        console.log(`   Accumulated Depreciation: $${accumDepr.toFixed(2)}`);
        console.log(`   Book Value: $${bookValue.toFixed(2)}`);
        console.log(`   Disposal Value: $${disposalValue.toFixed(2)}`);
        console.log(`   ${gainLoss >= 0 ? 'Gain' : 'Loss'}: $${Math.abs(gainLoss).toFixed(2)}`);

        // Validate it will balance
        const expectedDebits = disposalValue + accumDepr + (gainLoss < 0 ? Math.abs(gainLoss) : 0);
        const expectedCredits = assetCost + (gainLoss > 0 ? gainLoss : 0);

        if (Math.abs(expectedDebits - expectedCredits) > 0.01) {
          console.log(`   ❌ ERROR: Entry would not balance!`);
          console.log(`      Expected Debits: $${expectedDebits.toFixed(2)}`);
          console.log(`      Expected Credits: $${expectedCredits.toFixed(2)}`);
          continue;
        }

        // Create new balanced journal entry
        const newEntry = await prisma.journalEntry.create({
          data: {
            transactionDate: voidedEntry.transactionDate,
            referenceNumber: `${voidedEntry.referenceNumber}-FIX`,
            description: `${voidedEntry.description} (Corrected)`,
            totalAmount: new Decimal(assetCost),
            currencyId: voidedEntry.currencyId || 'default',
            status: 'POSTED',
            createdById: voidedEntry.createdById
          }
        });

        // Create journal entry lines
        const lines = [];

        // 1. Dr Cash (disposal proceeds)
        lines.push(await prisma.journalEntryLine.create({
          data: {
            journalEntryId: newEntry.id,
            chartOfAccountId: cashAccount.id,
            debitAmount: new Decimal(disposalValue),
            creditAmount: new Decimal(0),
            description: cashLine.description,
            vatAmount: new Decimal(0)
          }
        }));

        // 2. Dr Accumulated Depreciation (if > 0)
        if (accumDepr > 0.01) {
          lines.push(await prisma.journalEntryLine.create({
            data: {
              journalEntryId: newEntry.id,
              chartOfAccountId: accumDepLine.chartOfAccountId,
              debitAmount: new Decimal(accumDepr),
              creditAmount: new Decimal(0),
              description: accumDepLine.description,
              vatAmount: new Decimal(0)
            }
          }));
        }

        // 3. Dr Loss or Cr Gain (balancing entry)
        if (Math.abs(gainLoss) > 0.01) {
          const glAccount = gainLoss < 0 ? lossAccount : gainAccount;
          lines.push(await prisma.journalEntryLine.create({
            data: {
              journalEntryId: newEntry.id,
              chartOfAccountId: glAccount.id,
              debitAmount: gainLoss < 0 ? new Decimal(Math.abs(gainLoss)) : new Decimal(0),
              creditAmount: gainLoss > 0 ? new Decimal(gainLoss) : new Decimal(0),
              description: `${gainLoss > 0 ? 'Gain' : 'Loss'} on disposal (corrected)`,
              vatAmount: new Decimal(0)
            }
          }));
        }

        // 4. Cr Asset Account
        lines.push(await prisma.journalEntryLine.create({
          data: {
            journalEntryId: newEntry.id,
            chartOfAccountId: assetLine.chartOfAccountId,
            debitAmount: new Decimal(0),
            creditAmount: new Decimal(assetCost),
            description: assetLine.description,
            vatAmount: new Decimal(0)
          }
        }));

        // Verify the new entry balances
        const totalDebits = lines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
        const totalCredits = lines.reduce((sum, line) => sum + Number(line.creditAmount), 0);

        console.log(`\n   ✅ Created balanced entry: ${newEntry.referenceNumber}`);
        console.log(`      Total Debits: $${totalDebits.toFixed(2)}`);
        console.log(`      Total Credits: $${totalCredits.toFixed(2)}`);
        console.log(`      Difference: $${Math.abs(totalDebits - totalCredits).toFixed(2)}`);
        
        if (Math.abs(totalDebits - totalCredits) < 0.01) {
          console.log('      ✅ Entry is balanced!');
          fixed++;
        } else {
          console.log('      ❌ WARNING: Entry is not balanced!');
        }

      } catch (error) {
        console.error(`   ❌ Error processing ${voidedEntry.referenceNumber}:`, error.message);
      }
    }

    // Summary
    console.log('\n═'.repeat(40));
    console.log('SUMMARY');
    console.log('═'.repeat(40));
    console.log(`✅ Fixed ${fixed} out of ${voidedDisposals.length} voided disposal entries`);
    console.log(`\nNew balanced entries created with "-FIX" suffix`);
    console.log(`Original voided entries remain for audit trail\n`);

    return fixed;

  } catch (error) {
    console.error('\n❌ Error fixing disposal entries:', error.message);
    console.error(error);
    throw error;
  }
}

async function main() {
  try {
    const fixed = await fixAssetDisposalEntries();
    
    if (fixed > 0) {
      console.log('🎉 All asset disposal entries have been fixed!');
      console.log('\n📝 Next Step: Run audit script to verify:');
      console.log('   node scripts/audit-journal-entries.js\n');
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


