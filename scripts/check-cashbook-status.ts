import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkCashbookStatus() {
  try {
    console.log('🏦 Checking Cashbook Module Status...\n');
    
    // Check if Bank model exists and has data
    console.log('📊 Bank Accounts:');
    const banks = await prisma.bank.findMany({
      include: {
        currency: true,
        glAccount: true
      }
    });
    
    console.log(`   Found ${banks.length} bank accounts:`);
    banks.forEach(bank => {
      console.log(`   - ${bank.name} (${bank.accountNumber})`);
      console.log(`     Currency: ${bank.currency?.code || 'N/A'}`);
      console.log(`     GL Account: ${bank.glAccount?.accountNo || 'Not linked'} - ${bank.glAccount?.accountName || 'N/A'}`);
      console.log(`     Active: ${bank.isActive}`);
    });
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Check CashbookEntry model
    console.log('📝 Cashbook Entries:');
    const cashbookEntries = await prisma.cashbookEntry.findMany({
      take: 10,
      include: {
        bank: true,
        journalEntry: true,
        customer: true,
        vendor: true,
        glAccount: true
      },
      orderBy: { createdAt: 'desc' }
    });
    
    console.log(`   Found ${cashbookEntries.length} cashbook entries:`);
    cashbookEntries.forEach(entry => {
      console.log(`   - ${entry.id.slice(-8)}: ${entry.type} - $${entry.amount}`);
      console.log(`     Bank: ${entry.bank.name}`);
      console.log(`     Description: ${entry.description}`);
      console.log(`     Status: ${entry.status}`);
      console.log(`     Counterparty: ${entry.counterpartyType}`);
      if (entry.journalEntry) {
        console.log(`     Journal Entry: ${entry.journalEntry.referenceNumber}`);
      }
      console.log('');
    });
    
    console.log('\n' + '='.repeat(80) + '\n');
    
    // Check for any issues
    console.log('🔍 Potential Issues to Check:');
    
    // 1. Banks without GL accounts
    const banksWithoutGL = banks.filter(bank => !bank.glAccountId);
    if (banksWithoutGL.length > 0) {
      console.log(`   ⚠️  ${banksWithoutGL.length} banks without GL account links:`);
      banksWithoutGL.forEach(bank => {
        console.log(`     - ${bank.name} (${bank.accountNumber})`);
      });
    } else {
      console.log('   ✅ All banks have GL account links');
    }
    
    // 2. Cashbook entries without journal entries
    const entriesWithoutJE = cashbookEntries.filter(entry => !entry.journalEntryId);
    if (entriesWithoutJE.length > 0) {
      console.log(`   ⚠️  ${entriesWithoutJE.length} cashbook entries without journal entries:`);
      entriesWithoutJE.forEach(entry => {
        console.log(`     - ${entry.id.slice(-8)}: ${entry.type} - $${entry.amount} (${entry.status})`);
      });
    } else {
      console.log('   ✅ All cashbook entries have journal entries');
    }
    
    // 3. Check counterparty relationships
    console.log('\n📋 Counterparty Analysis:');
    const counterpartyStats = {
      GL: cashbookEntries.filter(e => e.counterpartyType === 'GL').length,
      CUSTOMER: cashbookEntries.filter(e => e.counterpartyType === 'CUSTOMER').length,
      SUPPLIER: cashbookEntries.filter(e => e.counterpartyType === 'SUPPLIER').length
    };
    
    console.log(`   GL Transactions: ${counterpartyStats.GL}`);
    console.log(`   Customer Transactions: ${counterpartyStats.CUSTOMER}`);
    console.log(`   Supplier Transactions: ${counterpartyStats.SUPPLIER}`);
    
    // 4. Check for missing relationships
    const missingRelations = cashbookEntries.filter(entry => {
      if (entry.counterpartyType === 'GL' && !entry.glAccountId) return true;
      if (entry.counterpartyType === 'CUSTOMER' && !entry.customerId) return true;
      if (entry.counterpartyType === 'SUPPLIER' && !entry.vendorId) return true;
      return false;
    });
    
    if (missingRelations.length > 0) {
      console.log(`   ⚠️  ${missingRelations.length} entries with missing counterparty relationships:`);
      missingRelations.forEach(entry => {
        console.log(`     - ${entry.id.slice(-8)}: ${entry.counterpartyType} but no ${entry.counterpartyType.toLowerCase()}Id`);
      });
    } else {
      console.log('   ✅ All entries have proper counterparty relationships');
    }
    
  } catch (error: any) {
    console.error('❌ Error checking cashbook status:', error.message);
    
    if (error.message.includes('model') || error.message.includes('does not exist')) {
      console.log('\n🔧 Database Schema Issues Detected:');
      console.log('   - Cashbook models may not be properly migrated');
      console.log('   - Run: npx prisma db push');
      console.log('   - Or: npx prisma migrate dev');
    }
  } finally {
    await prisma.$disconnect();
  }
}

checkCashbookStatus();



