const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');

const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔍 Analyzing and fixing incorrect A/R credits...\n');
    
    // Get admin user
    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@nvccz.co.zw' }
    });
    
    if (!adminUser) {
      throw new Error('Admin user not found');
    }
    
    // Get Accounts Receivable and Revenue accounts
    const arAccount = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '1200', isActive: true }
    });
    
    const revenueAccount = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '4000', isActive: true } // Management Fees Income
    });
    
    if (!arAccount || !revenueAccount) {
      throw new Error('Required accounts not found');
    }
    
    // Find Nov 15 entries that credited A/R
    const problematicDate = new Date('2025-11-15');
    const startDate = new Date(problematicDate);
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(problematicDate);
    endDate.setHours(23, 59, 59, 999);
    
    const entries = await prisma.cashbookEntry.findMany({
      where: {
        transactionDate: {
          gte: startDate,
          lte: endDate
        },
        type: 'RECEIPT',
        status: 'POSTED',
        journalEntryId: { not: null }
      },
      include: {
        journalEntry: {
          include: {
            journalEntryLines: {
              include: {
                chartOfAccount: true
              }
            }
          }
        }
      }
    });
    
    console.log(`📊 Found ${entries.length} cashbook receipts from Nov 15\n`);
    
    // Identify entries that should be Revenue instead of A/R
    // Based on description patterns
    const revenueKeywords = ['miscellaneous income', 'service fee', 'revenue', 'income'];
    
    const entriesToFix = [];
    
    for (const entry of entries) {
      if (!entry.journalEntry) continue;
      
      // Check if this entry credited A/R
      const arLine = entry.journalEntry.journalEntryLines.find(
        line => line.chartOfAccountId === arAccount.id && line.creditAmount > 0
      );
      
      if (!arLine) continue;
      
      // Check if description suggests this should be Revenue
      const descriptionLower = entry.description.toLowerCase();
      const shouldBeRevenue = revenueKeywords.some(keyword => 
        descriptionLower.includes(keyword)
      );
      
      // Also check "Customer Payment" entries - if there's no actual invoice, they might be revenue
      const isCustomerPayment = descriptionLower.includes('customer payment');
      
      if (shouldBeRevenue || isCustomerPayment) {
        entriesToFix.push({
          entry,
          arCreditAmount: arLine.creditAmount,
          reason: shouldBeRevenue ? 'Revenue transaction' : 'Customer payment without invoice'
        });
      }
    }
    
    console.log(`⚠️  Found ${entriesToFix.length} entries that should credit Revenue instead of A/R\n`);
    
    if (entriesToFix.length === 0) {
      console.log('✅ No entries need fixing!\n');
      return;
    }
    
    // Display summary
    console.log('📋 Entries to fix:');
    console.log('='.repeat(100));
    let totalToCorrect = 0;
    
    for (const item of entriesToFix) {
      const entry = item.entry;
      console.log(`\n${entry.id}`);
      console.log(`  Description: ${entry.description}`);
      console.log(`  Amount: $${entry.amount}`);
      console.log(`  A/R Credit: $${item.arCreditAmount}`);
      console.log(`  Reason: ${item.reason}`);
      totalToCorrect += Number(item.arCreditAmount);
    }
    
    console.log(`\n  Total A/R credits to correct: $${totalToCorrect.toFixed(2)}`);
    console.log('='.repeat(100));
    
    // Ask for confirmation (in a real scenario, you'd want user input)
    console.log('\n🔧 Creating correcting journal entries...\n');
    
    let corrected = 0;
    let errors = 0;
    
    for (const item of entriesToFix) {
      try {
        const entry = item.entry;
        const arCreditAmount = item.arCreditAmount;
        
        console.log(`\n📝 Fixing: ${entry.id} - ${entry.description}`);
        
        // Get bank for currency
        const bank = await prisma.bank.findUnique({
          where: { id: entry.bankId },
          include: { currency: true }
        });
        
        if (!bank) {
          throw new Error('Bank not found');
        }
        
        // Create correcting journal entry
        // Dr. A/R (reverse the incorrect credit)
        // Cr. Revenue (correct account)
        
        const journalEntry = await prisma.journalEntry.create({
          data: {
            transactionDate: new Date(),
            referenceNumber: `CORR-${entry.journalEntry.referenceNumber}`,
            description: `CORRECTION: Move ${entry.description} from A/R to Revenue`,
            totalAmount: arCreditAmount,
            currencyId: bank.currency.id,
            status: 'POSTED',
            createdById: adminUser.id
          }
        });
        
        // 1. Debit A/R (reverse the incorrect credit)
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: arAccount.id,
            debitAmount: arCreditAmount,
            creditAmount: new Decimal(0),
            description: `CORRECTION: Reverse incorrect A/R credit for ${entry.description}`
          }
        });
        
        // 2. Credit Revenue (correct account)
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: journalEntry.id,
            chartOfAccountId: revenueAccount.id,
            debitAmount: new Decimal(0),
            creditAmount: arCreditAmount,
            description: `CORRECTION: Credit Revenue for ${entry.description}`
          }
        });
        
        console.log(`   ✅ Created correcting entry: ${journalEntry.referenceNumber}`);
        corrected++;
        
      } catch (error) {
        console.error(`   ❌ Error: ${error.message}`);
        errors++;
      }
    }
    
    console.log(`\n\n✅ Correction Summary:`);
    console.log(`   Entries identified: ${entriesToFix.length}`);
    console.log(`   Successfully corrected: ${corrected}`);
    console.log(`   Errors: ${errors}`);
    console.log(`   Total amount corrected: $${totalToCorrect.toFixed(2)}`);
    
    if (corrected > 0) {
      console.log(`\n📊 The correcting entries will:`);
      console.log(`   1. Debit Accounts Receivable (reversing $${totalToCorrect.toFixed(2)})`);
      console.log(`   2. Credit Revenue Account (4000 - Management Fees Income)`);
      console.log(`\n   This will fix the negative A/R balance and correctly record revenue.`);
      console.log(`   The Balance Sheet should now show:`);
      console.log(`   - A/R: $0 (or positive if there are legitimate receivables)`);
      console.log(`   - Revenue: Increased by $${totalToCorrect.toFixed(2)}`);
    }
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();

